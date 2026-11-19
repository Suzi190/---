package com.chachaji.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 叉叉机 Android 外壳。
 *
 * 核心职责：
 *  1. 全屏沉浸 —— 内容延伸到状态栏、导航栏、刘海(cutout)区域，顶部不留黑边。
 *  2. 键盘联动 —— 监听 IME insets，直接压缩 WebView 的可绘制区域。
 *     系统键盘动画期间 insets 会逐帧回调，所以 WebView 是"跟着键盘一起长高/变矮"的，
 *     输入框永远贴在最底下、永远不会被键盘盖住。这比 Web 层用 setTimeout + scrollTo 猜测要精确得多。
 *  3. 把真实的安全区/键盘高度广播给 JS，让页面顶部内容正确避让刘海。
 */
public class MainActivity extends BridgeActivity {

    private WebView webView;
    private int lastImePx = -1;
    private int lastTopPx = -1;
    private int lastBottomPx = -1;
    private float density = 3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须早于 super.onCreate()，否则插件注册不进 Bridge
        registerPlugin(MixNativeBridgePlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        DisplayMetrics dm = getResources().getDisplayMetrics();
        density = dm.density > 0 ? dm.density : 3f;

        // ---------- 1. 全屏沉浸 ----------
        // setDecorFitsSystemWindows(false) 让 WebView 铺满整块屏幕（含状态栏与导航栏区域），
        // 这是"顶部不空一块"的前提。Android 15 强制 edge-to-edge，这里主动配合，行为一致。
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // 允许绘制到刘海区域（短边），否则刘海两侧会留黑条
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        // 深色背景 → 状态栏图标用浅色
        WindowInsetsControllerCompat ctl =
                WindowCompat.getInsetsController(window, window.getDecorView());
        ctl.setAppearanceLightStatusBars(false);
        ctl.setAppearanceLightNavigationBars(false);

        // 导航栏手势模式：贴底，避免出现系统黑色条
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }

        if (getBridge() != null) {
            webView = getBridge().getWebView();
        }
        if (webView != null) {
            webView.setBackgroundColor(Color.BLACK);
            // 避免系统在键盘弹出时自己去 resize，造成与下面 insets 逻辑双重压缩
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }

        // ---------- 2. 键盘 / 安全区 ----------
        final View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, new OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());

                // 顶部安全区取状态栏与刘海的最大值
                int topPx = Math.max(sys.top, cut.top);
                int bottomPx = Math.max(sys.bottom, cut.bottom);
                int imePx = ime.bottom;

                applyInsets(topPx, bottomPx, imePx);
                return insets;
            }
        });
        ViewCompat.requestApplyInsets(decor);
    }

    /**
     * 只在数值真正变化时才动手，避免键盘动画期间做无谓的 layout。
     */
    private void applyInsets(int topPx, int bottomPx, int imePx) {
        if (webView != null && imePx != lastImePx) {
            lastImePx = imePx;
            // 关键的一行：WebView 底部让出键盘高度。
            // 内容区随之变矮 → JS 的 window.innerHeight / visualViewport 同步变小 →
            // 页面里 position:fixed 的输入栏自动上浮，和键盘严丝合缝。
            webView.setPadding(0, 0, 0, imePx);
        }
        if (topPx != lastTopPx || bottomPx != lastBottomPx) {
            lastTopPx = topPx;
            lastBottomPx = bottomPx;
            pushInsetsToJs(topPx, bottomPx, imePx);
        }
    }

    private void pushInsetsToJs(int topPx, int bottomPx, int imePx) {
        if (webView == null) return;
        int topCss = Math.round(topPx / density);
        int bottomCss = Math.round(bottomPx / density);
        int imeCss = Math.round(imePx / density);
        String js = "window.__ccjNativeInsets&&window.__ccjNativeInsets({top:" + topCss
                + ",bottom:" + bottomCss + ",keyboard:" + imeCss
                + ",density:" + density + "});";
        try {
            webView.evaluateJavascript(js, null);
        } catch (Throwable ignored) {
        }
    }
}
