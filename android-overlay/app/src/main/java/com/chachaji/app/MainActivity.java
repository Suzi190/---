package com.chachaji.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
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
 * ── 键盘 ──
 * 结论先说：键盘必须由原生改 WebView 的【真实高度】来躲，不可以用 setPadding，也不可以指望 Chromium。
 *   · 为什么不能指望 Chromium：index.html 虽然给 viewport 追加了 interactive-widget=resizes-content，
 *     但 vivo 这类国产 ROM 的 WebView 根本不响应 IME insets，visualViewport 不会自己变，
 *     window.innerHeight 也不变 —— 页面拿不到任何"键盘弹起了"的信号，输入栏就一直被盖住。
 *   · 为什么不能 setPadding：它只裁剪绘制区域，Chromium 内部 viewport 尺寸不变，
 *     innerHeight 不变，position:fixed 的输入栏纹丝不动（第 4 版就栽在这）。
 *   · 改 layoutParams.height 会触发 onSizeChanged → viewport 真的变矮 → innerHeight /
 *     visualViewport.height 一起变小 → 聊天页容器 --active-viewport-height 跟着变矮 → 输入栏浮到键盘上沿。
 *
 * 注意：页面侧 first-paint.js 还有一层「输入栏 translateY(-键盘高)」的补偿，那是给
 * 「容器高度不变、只平移」的场景写的。我们这边容器已经真的变矮了，那层平移要是再生效
 * 就会把输入栏再往上顶一个键盘高（就是「输入框飞到屏幕中间、底下空一大块黑」）。
 * 所以 capacitor-shell.js 会在原生环境下把那层 transform 中和掉，两边配合才是对的。
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
            // 键盘高度 → 压缩 WebView 真实高度（逐帧跟随键盘动画）。
            // 这是本机唯一有效的机制，别删（见类注释里的三条对比）。
            resizeWebViewForIme(window.getDecorView(), ime.bottom);
            // 刘海高度 / 键盘开合 → 同步给页面
            pushInsetVars(cut.top, cut.bottom, ime.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(window.getDecorView());
    }

    /**
     * 把 WebView 的真实高度压掉键盘高度。
     *
     * 每次 insets 回调都重新算一遍（不是只在键盘变化时），这样旋转屏幕、分屏、
     * 从后台切回来之后高度都能自动修正，不会残留错误值。
     */
    private void resizeWebViewForIme(View decor, int imePx) {
        if (webView == null || decor == null) return;
        int fullH = decor.getHeight();
        if (fullH <= 0) {
            fullH = getResources().getDisplayMetrics().heightPixels;
        }
        if (fullH <= 0) return;
        int targetH = Math.max(1, fullH - Math.max(0, imePx));
        ViewGroup.LayoutParams lp = webView.getLayoutParams();
        if (lp == null || lp.height == targetH) return;
        lp.height = targetH;
        webView.setLayoutParams(lp);
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
        if (hasFocus) {
            hideSystemBars();
            // 从后台回来、或输入法把窗口顶过后，再要一次 insets：
            // 保证 WebView 高度能按当前键盘状态重新算一遍，不残留“变矮”的状态
            ViewCompat.requestApplyInsets(getWindow().getDecorView());
        }
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
