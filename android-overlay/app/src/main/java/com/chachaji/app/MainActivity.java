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
 * 只做两件事，都交给系统，不自己造轮子：
 *
 *  1. 隐藏状态栏 / 导航栏（真全屏），并允许内容画到刘海区。
 *  2. 键盘：完全依赖系统的 adjustResize。
 *
 * 为什么不用 edge-to-edge + 自己算 IME insets：
 *  - edge-to-edge（setDecorFitsSystemWindows(false)）会让系统的 adjustResize 失效，
 *    键盘弹出时窗口不再缩小，底部输入框必然被盖住。
 *  - 之前试过监听 insets 再对 WebView setPadding，也是错的：padding 只裁剪绘制区域，
 *    不会改变 WebView 内部 viewport，window.innerHeight 不变，页面里的输入栏根本不会动。
 *
 * 现在 targetSdk 固定为 34（见 scripts/patch-android.js），Android 15 不会强制 edge-to-edge，
 * adjustResize 恢复正常：键盘弹出 → 窗口变矮 → WebView 真的变小 → innerHeight 变小 →
 * 底部输入栏自动浮到键盘上沿。全程跟随键盘动画逐帧联动，不需要任何 hack。
 */
public class MainActivity extends BridgeActivity {

    private WebView webView;
    private int lastCutTopCss = -1;
    private int lastCutBottomCss = -1;
    private float density = 3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须早于 super.onCreate()，否则插件注册不进 Bridge
        registerPlugin(MixNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        DisplayMetrics dm = getResources().getDisplayMetrics();
        density = dm.density > 0 ? dm.density : 3f;

        // 保持传统的 decorFits 行为，这是 adjustResize 能生效的前提
        WindowCompat.setDecorFitsSystemWindows(window, true);

        // 允许内容绘制到刘海（短边）区域，否则刘海两侧会留黑条
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        // 系统栏透明 + 关闭对比度遮罩：隐藏时无异色，边缘滑动临时调出时也不会出现灰条
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

        // 状态栏和导航栏都藏起来了，但刘海仍然占地方：把刘海高度告诉 JS，
        // 让页面顶部内容（标题栏、返回按钮）自动避开摄像头。
        ViewCompat.setOnApplyWindowInsetsListener(window.getDecorView(), (v, insets) -> {
            Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            pushCutoutToJs(cut.top, cut.bottom);
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
     * 切回前台、弹窗关闭、键盘收起后，系统栏有可能自己冒出来，这里再压一次。
     * 少了这一步，从后台切回来就会看到状态栏又出现了。
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void pushCutoutToJs(int cutTopPx, int cutBottomPx) {
        int topCss = Math.round(cutTopPx / density);
        int bottomCss = Math.round(cutBottomPx / density);
        if (topCss == lastCutTopCss && bottomCss == lastCutBottomCss) return;
        lastCutTopCss = topCss;
        lastCutBottomCss = bottomCss;
        if (webView == null) return;
        String js = "window.__ccjNativeInsets&&window.__ccjNativeInsets({top:" + topCss
                + ",bottom:" + bottomCss + ",keyboard:0,density:" + density + "});";
        try {
            webView.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
        }
    }
}
