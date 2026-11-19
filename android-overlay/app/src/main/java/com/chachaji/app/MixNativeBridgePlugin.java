package com.chachaji.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 网页层 js/native-bridge.js 依赖的原生插件（名称必须是 MixNativeBridge）。
 *
 * 它探测并调用这些方法，缺任何一个都会让对应能力在 APK 里"静默失效"：
 *   文件导出：startFileSaveSession / appendFileSaveChunk / finishFileSaveSession
 *            abortFileSaveSession / saveFileToDownloads
 *   通知    ：checkNotificationPermission / requestNotificationPermission / showNotification
 *   保活    ：startForegroundTask / stopForegroundTask
 *
 * 导出为什么必须走原生：APK 的 WebView 里 <a download> 和 Blob 下载全部无效，
 * 网页层一旦发现没有本插件就会抛 native_file_save_unavailable —— 就是"点导出没反应"。
 */
@CapacitorPlugin(
        name = "MixNativeBridge",
        permissions = {
                @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
        }
)
public class MixNativeBridgePlugin extends Plugin {

    private static final String CHANNEL_ID = "ccj_messages";
    private static final String CHANNEL_KEEPALIVE = "ccj_keepalive";

    /** 分块写文件用的会话表 */
    private final Map<String, SaveSession> sessions = new HashMap<>();

    private static class SaveSession {
        File tempFile;
        FileOutputStream stream;
        String fileName;
        String mimeType;
        boolean closed;
        long written;
    }

    // =========================================================
    //  一、文件导出
    // =========================================================

    @PluginMethod
    public void startFileSaveSession(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName", "chachaji-export.bin"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        try {
            File dir = new File(getContext().getCacheDir(), "export");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("cache_dir_unavailable");
                return;
            }
            File temp = new File(dir, "s_" + System.currentTimeMillis() + "_" + safeNameOnly(fileName));
            SaveSession s = new SaveSession();
            s.tempFile = temp;
            s.stream = new FileOutputStream(temp);
            s.fileName = fileName;
            s.mimeType = mimeType;

            String id = UUID.randomUUID().toString();
            sessions.put(id, s);

            JSObject ret = new JSObject();
            ret.put("sessionId", id);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("start_session_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void appendFileSaveChunk(PluginCall call) {
        String id = call.getString("sessionId", "");
        String b64 = call.getString("base64Data", "");
        SaveSession s = sessions.get(id);
        if (s == null || s.stream == null) {
            call.reject("session_not_found");
            return;
        }
        try {
            byte[] chunk = Base64.decode(b64, Base64.DEFAULT);
            s.stream.write(chunk);
            s.written += chunk.length;
            call.resolve();
        } catch (Exception e) {
            call.reject("append_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void finishFileSaveSession(PluginCall call) {
        String id = call.getString("sessionId", "");
        SaveSession s = sessions.get(id);
        if (s == null) {
            call.reject("session_not_found");
            return;
        }
        try {
            if (s.stream != null) {
                s.stream.flush();
                s.stream.close();
                s.stream = null;
            }
            s.closed = true;
            String uri = publishToDownloads(s.tempFile, s.fileName, s.mimeType);
            sessions.remove(id);
            try { s.tempFile.delete(); } catch (Throwable ignored) {}

            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? "" : uri);
            ret.put("bytes", s.written);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("finish_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void abortFileSaveSession(PluginCall call) {
        String id = call.getString("sessionId", "");
        SaveSession s = sessions.remove(id);
        if (s != null) {
            try { if (s.stream != null) s.stream.close(); } catch (Throwable ignored) {}
            try { if (s.tempFile != null) s.tempFile.delete(); } catch (Throwable ignored) {}
        }
        call.resolve();
    }

    /** 小文件一次性导出 */
    @PluginMethod
    public void saveFileToDownloads(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName", "chachaji-export.bin"));
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String b64 = call.getString("base64Data", "");
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            File dir = new File(getContext().getCacheDir(), "export");
            if (!dir.exists()) dir.mkdirs();
            File temp = new File(dir, "q_" + System.currentTimeMillis() + "_" + safeNameOnly(fileName));
            try (FileOutputStream fos = new FileOutputStream(temp)) {
                fos.write(data);
            }
            String uri = publishToDownloads(temp, fileName, mimeType);
            try { temp.delete(); } catch (Throwable ignored) {}

            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? "" : uri);
            ret.put("bytes", data.length);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save_failed: " + e.getMessage());
        }
    }

    /**
     * 把临时文件放进系统「下载」目录。
     * Android 10+ 走 MediaStore（不需要存储权限）；老系统直接写公共 Downloads。
     */
    private String publishToDownloads(File src, String fileName, String mimeType) throws Exception {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri item = ctx.getContentResolver().insert(collection, values);
            if (item == null) throw new Exception("mediastore_insert_failed");

            try (OutputStream os = ctx.getContentResolver().openOutputStream(item);
                 java.io.FileInputStream fis = new java.io.FileInputStream(src)) {
                if (os == null) throw new Exception("mediastore_open_failed");
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = fis.read(buf)) > 0) os.write(buf, 0, n);
                os.flush();
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.Downloads.IS_PENDING, 0);
            ctx.getContentResolver().update(item, done, null, null);
            return item.toString();
        }

        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloads.exists()) downloads.mkdirs();
        File dest = uniqueFile(downloads, fileName);
        try (java.io.FileInputStream fis = new java.io.FileInputStream(src);
             FileOutputStream fos = new FileOutputStream(dest)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = fis.read(buf)) > 0) fos.write(buf, 0, n);
        }
        return dest.getAbsolutePath();
    }

    private File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 9999; i++) {
            f = new File(dir, base + "(" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, "export_" + System.currentTimeMillis() + ext);
    }

    private String safeFileName(String name) {
        if (name == null || name.trim().isEmpty()) return "chachaji-export.bin";
        return name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_");
    }

    private String safeNameOnly(String name) {
        return safeFileName(name).replaceAll("[^\\w.\\-\\u4e00-\\u9fa5]", "_");
    }

    // =========================================================
    //  二、通知
    // =========================================================

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel msg = new NotificationChannel(CHANNEL_ID, "叉叉机消息", NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription("角色消息与生成完成提醒");
        msg.enableVibration(true);
        msg.setShowBadge(true);
        nm.createNotificationChannel(msg);

        NotificationChannel keep = new NotificationChannel(CHANNEL_KEEPALIVE, "后台运行", NotificationManager.IMPORTANCE_LOW);
        keep.setDescription("后台生成任务进行中");
        keep.setShowBadge(false);
        nm.createNotificationChannel(keep);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("permission", currentNotificationPermission());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject ret = new JSObject();
            ret.put("permission", currentNotificationPermission());
            call.resolve(ret);
            return;
        }
        if (PermissionState.GRANTED.equals(getPermissionState("notifications"))) {
            JSObject ret = new JSObject();
            ret.put("permission", "granted");
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("permission", currentNotificationPermission());
        call.resolve(ret);
    }

    private String currentNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            boolean on = nm != null && nm.areNotificationsEnabled();
            return on ? "granted" : "denied";
        }
        int state = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS);
        if (state == PackageManager.PERMISSION_GRANTED) return "granted";
        boolean asked = getActivity() != null
                && getActivity().shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS);
        return asked ? "denied" : "prompt";
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        ensureChannels();
        String title = call.getString("title", "叉叉机");
        String body = call.getString("body", "");
        String tag = call.getString("tag", "ccj-" + System.currentTimeMillis());
        boolean silent = call.getBoolean("silent", false);

        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { call.reject("no_notification_manager"); return; }

        NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setAutoCancel(true)
                .setPriority(silent ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
                .setDefaults(silent ? 0 : NotificationCompat.DEFAULT_ALL);

        try {
            Intent it = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
            if (it != null) {
                it.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getActivity(getContext(), tag.hashCode(), it, flags);
                b.setContentIntent(pi);
            }
        } catch (Throwable ignored) {}

        nm.notify(tag, 2101, b.build());
        call.resolve();
    }

    // =========================================================
    //  三、后台保活（轻量：常驻通知）
    // =========================================================

    @PluginMethod
    public void startForegroundTask(PluginCall call) {
        ensureChannels();
        String title = call.getString("title", "叉叉机后台运行中");
        String body = call.getString("body", "后台消息和生成会继续尝试运行");

        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) { call.reject("no_notification_manager"); return; }

        NotificationCompat.Builder b = new NotificationCompat.Builder(getContext(), CHANNEL_KEEPALIVE)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        nm.notify("ccj-keepalive", 2102, b.build());
        call.resolve();
    }

    @PluginMethod
    public void stopForegroundTask(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel("ccj-keepalive", 2102);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (SaveSession s : sessions.values()) {
            try { if (s.stream != null) s.stream.close(); } catch (Throwable ignored) {}
            try { if (s.tempFile != null) s.tempFile.delete(); } catch (Throwable ignored) {}
        }
        sessions.clear();
        super.handleOnDestroy();
    }
}
