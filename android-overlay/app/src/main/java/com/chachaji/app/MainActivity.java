package com.chachaji.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 叉叉机 Android 外壳。
 *
 * ── 全屏 ──
 * 用 edge-to-edge，WebView 铺满整块屏幕：状态栏、导航栏、刘海区全部用上，一条黑边都不留。
 * 状态栏和导航栏本身是隐藏的，需要时从屏幕边缘滑一下才会临时出来。
 * 页面顶部的标题栏靠原生传下去的刘海高度（--sat）自己避让摄像头，背景色仍然铺到刘海区。
 *
 * ── 键盘（这里绝对不要插手）──
 * index.html 的第一段脚本会给 viewport 追加 interactive-widget=resizes-content，
 * 意思是「键盘弹起时布局视口跟着缩小」。全屏（edge-to-edge）之后，Chromium 会自己读
 * IME insets 并完成这次缩小，window.innerHeight / visualViewport.height 都会正确变小，
 * 页面里 --active-viewport-height / --keyboard-bottom-overlap 那套逻辑随之生效。
 *
 * 所以原生这边只要不吭声就是对的。之前踩过两次坑，都记在这里免得再犯：
 *   · setPadding(0,0,0,ime)：只裁剪绘制区域，Chromium viewport 不变 → innerHeight 不变 → 输入栏纹丝不动。
 *   · 改 layoutParams.height：等于在 Chromium 已经扣掉键盘的基础上【再扣一次】，
 *     聊天页容器只剩「全屏 − 2×键盘」，输入栏被顶到屏幕中间，底下空出一大块黑 ——
 *     用户看到的「输入框飞上去 + 雷霆大黑边」就是这个。
 * 原生现在只做两件事：全屏 + 把刘海高度/键盘开关告诉页面。
 */
public class MainActivity extends BridgeActivity {

    private WebView webView;
    private int lastCutTopCss = -1;
    private int lastCutBottomCss = -1;
    private int lastImeFlag = -1;
    private float density = 3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须早于 super.onCreate()，否则插件注册不进 Bridge
        registerPlugin(MixNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        DisplayMetrics dm = getResources().getDisplayMetrics();
        density = dm.density > 0 ? dm.density : 3f;

        // 关键：内容铺满整块屏幕（含状态栏 / 导航栏 / 刘海区）。
        // 一旦这里改成 true，WebView 就不再延伸到屏幕边缘，刘海那片露出窗口背景，
        // 整条就是纯黑的 —— 上一版的「不全屏、刘海区变黑」就是这么来的。
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // 允许内容绘制到刘海（短边）区域，否则刘海两侧会留黑条
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        // 系统栏透明 + 关闭对比度遮罩：隐藏时无异色，边缘滑出时也不会压一层灰
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        hideSystemBars();

        if (getBridge() != null) {
            webView = getBridge().getWebView();
        }
        if (webView != null) {
            webView.setBackgroundColor(Color.BLACK);
        }

        final Window win = window;
        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            // 注意：这里【不要】改 WebView 的高度，键盘缩放由 Chromium 自己完成（见类注释）。
            // 刘海高度 / 键盘开合 → 同步给页面
            pushInsetVars(cut.top, cut.bottom, ime.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(window.getDecorView());
    }

    /** 真正把状态栏和导航栏藏起来；用户从屏幕边缘滑动时可以临时调出来 */
    private void hideSystemBars() {
        Window window = getWindow();
        WindowInsetsControllerCompat ctl =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (ctl == null) return;
        ctl.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        ctl.hide(WindowInsetsCompat.Type.systemBars());
        // 深色界面 → 临时滑出的系统栏图标用浅色，看得清
        ctl.setAppearanceLightStatusBars(false);
        ctl.setAppearanceLightNavigationBars(false);
    }

    /**
     * 切回前台、弹窗关闭后系统栏有可能自己冒出来，这里再压一次。
     * 少了这一步，从后台切回来就会看到状态栏又出现在刘海底下。
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void pushInsetVars(int cutTopPx, int cutBottomPx, int imePx) {
        int topCss = Math.round(cutTopPx / density);
        int bottomCss = Math.round(cutBottomPx / density);
        // 键盘只区分「开 / 关」两种状态，不逐帧推送，避免每帧都往 JS 里打字符串
        int imeFlag = imePx > 0 ? 1 : 0;
        if (topCss == lastCutTopCss && bottomCss == lastCutBottomCss && imeFlag == lastImeFlag) return;
        lastCutTopCss = topCss;
        lastCutBottomCss = bottomCss;
        lastImeFlag = imeFlag;
        if (webView == null) return;
        int imeCss = imeFlag == 1 ? Math.round(imePx / density) : 0;
        String js = "window.__ccjNativeInsets&&window.__ccjNativeInsets({top:" + topCss
                + ",bottom:" + bottomCss + ",keyboard:" + imeCss + ",density:" + density + "});";
        try {
            webView.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
        }
    }
}
