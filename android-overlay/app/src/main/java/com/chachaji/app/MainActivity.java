package com.chachaji.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.List;

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
    /**
     * 「键盘收起时的整屏高度」，单位 px。
     *
     * 这是躲键盘的唯一基准，绝对不能拿 decor.getHeight() 现算 ——
     * Manifest 里写的是 adjustResize，键盘弹起时系统可能已经把窗口/decor 缩掉了，
     * 此时 decor.getHeight() 本身就是「全屏 - 键盘」，再减一次键盘就是扣两次：
     * WebView 只剩屏幕上方很窄的一条，下面空出整块深色（这就是用户反馈的"深色背景特别大一块"）。
     */
    private int fullHeightPx = 0;

    /**
     * 键盘弹出 / 收起的动画是否正在进行。
     *
     * 为什么要这个标志：onApplyWindowInsets 在键盘动画【刚开始】的那一刻就把最终 IME 高度
     * 给我们了。如果这时立刻把 WebView 压到最终高度，键盘本体还要滑 200~300ms 才上来，
     * 中间这段时间 WebView 底下就是空的 —— 露出的正是窗口背景，"深色一大块"就是这么来的。
     * 所以动画期间高度改由 WindowInsetsAnimationCompat 每帧插值推进（见 setupImeAnimation）。
     */
    private boolean imeAnimating = false;
    /** 这一次键盘动画起始 / 结束时的 IME 高度（px），只在 ROM 不逐帧给值时用来插值 */
    private int animStartIme = 0;
    private int animEndIme = 0;
    /** 主线程 Handler：跑"动画看门狗"，保证高度最终一定回到正确值 */
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    /** 上一次 onProgress 里 insets 给出的 IME 高度，用来探测 ROM 有没有逐帧给值 */
    private int lastProgressIme = -1;
    /** ROM 在 onProgress 的 insets 里是否真的逐帧变化（不逐帧时改用 bounds 插值） */
    private boolean romInterpolatesInsets = true;
    /** 系统是否真的在帮我们缩窗口（adjustResize 生效）。只有 true 时才能用 decor 高度反推键盘状态 */
    private boolean systemResizesWindow = false;

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
            // 键盘高度 → 压缩 WebView 真实高度。这是本机唯一有效的机制，别删（见类注释三条对比）。
            // 但动画进行中不能在这里抢先设成最终值，否则 WebView 先缩、键盘后到，中间露出窗口底色。
            // 动画期间的高度由 setupImeAnimation 的 onProgress 逐帧推进。
            // 另外这里要延迟一帧：动画的 onStart 是在同一次 insets 分发里发生的，
            // 立刻压会把高度先跳到终点，紧接着第一帧 onProgress 又把它拉回起点 → 闪一下。
            final int imeBottom = ime.bottom;
            final View decorView = window.getDecorView();
            decorView.post(() -> {
                if (!imeAnimating) resizeWebViewForIme(decorView, imeBottom);
            });
            // 刘海高度 / 键盘开合 → 同步给页面
            pushInsetVars(cut.top, cut.bottom, ime.bottom);
            return insets;
        });
        // 让 WebView 高度跟着键盘弹出/收起动画逐帧走，和键盘严丝合缝
        setupImeAnimation(window.getDecorView());
        ViewCompat.requestApplyInsets(window.getDecorView());
    }

    /**
     * WebView 高度逐帧跟随键盘动画。
     *
     * Android 11+ 的键盘是带动画的，onApplyWindowInsets 只在开头/结尾给出终值，
     * 中间过程要靠 WindowInsetsAnimationCompat 的 onProgress 每帧回调。
     *
     * ⚠️ 血的教训（第 3 版翻车在这里）：**不能拿动画的 bounds 上下界当最终答案**。
     *    有的 ROM 在「收起键盘」时 bounds 的 upper 仍然是键盘高度（上下界给反了），
     *    照它收尾就会把 WebView 永久停在"键盘态" —— 收起键盘后下面留一整块底色，再也回不来。
     *    现在的规矩：动画只负责"过程好看"，**最终高度一律以系统真实的 ime insets 为准**
     *    （onEnd / 看门狗都走 syncFromCurrentInsets）。
     *
     * Android 10 及以下没有这套 API，回调不会触发，走 onApplyWindowInsets 的老路即可。
     */
    private void setupImeAnimation(View decorView) {
        ViewCompat.setWindowInsetsAnimationCallback(decorView,
                new WindowInsetsAnimationCompat.Callback(
                        WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                    @Override
                    public WindowInsetsAnimationCompat.BoundsCompat onStart(
                            WindowInsetsAnimationCompat animation,
                            WindowInsetsAnimationCompat.BoundsCompat bounds) {
                        if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                            imeAnimating = true;
                            animStartIme = Math.max(0, bounds.getLowerBound().bottom);
                            animEndIme = Math.max(0, bounds.getUpperBound().bottom);
                            lastProgressIme = -1;
                            romInterpolatesInsets = true;
                            startAnimWatchdog();
                        }
                        return bounds;
                    }

                    @Override
                    public WindowInsetsCompat onProgress(WindowInsetsCompat insets,
                                                         List<WindowInsetsAnimationCompat> running) {
                        if (!imeAnimating || running == null) return insets;
                        for (int i = 0; i < running.size(); i++) {
                            WindowInsetsAnimationCompat anim = running.get(i);
                            if (anim == null) continue;
                            if ((anim.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) continue;

                            float f = anim.getInterpolatedFraction();
                            if (f < 0f) f = 0f;
                            if (f > 1f) f = 1f;
                            int curveIme = Math.round(animStartIme + (animEndIme - animStartIme) * f);
                            int insetsIme = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;

                            // 探测：动画走到中段、insets 里的 IME 高度却一直没变
                            // → 这家 ROM 不逐帧给值，退回用 bounds 插值（否则会一秒跳到位）
                            if (romInterpolatesInsets && f > 0.2f && f < 0.8f
                                    && lastProgressIme == insetsIme
                                    && Math.abs(insetsIme - curveIme) > 6) {
                                romInterpolatesInsets = false;
                            }
                            lastProgressIme = insetsIme;

                            applyWebViewHeight(romInterpolatesInsets ? insetsIme : curveIme);
                            break;
                        }
                        return insets;
                    }

                    @Override
                    public void onEnd(WindowInsetsAnimationCompat animation) {
                        if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) {
                            imeAnimating = false;
                            // 以真实 insets 收尾（绝不能信 animEndIme，见方法注释）
                            syncFromCurrentInsets();
                            // 键盘收起时系统的 insets 更新有时比动画晚一拍，再补一次
                            uiHandler.removeCallbacksAndMessages(null);
                            uiHandler.postDelayed(MainActivity.this::syncFromCurrentInsets, 240);
                        }
                    }
                });
    }

    /**
     * 看门狗：动画开始后 600ms 无条件收尾。
     *
     * 有的 ROM 的 onEnd 根本不触发（或被 WebView 连续 layout 打乱），
     * 一旦卡在 imeAnimating=true，高度就再也不更新 —— 现象正是"收起键盘后下面一直留一大块"。
     * 这里到点强行置 false 并按真实 insets 校正，最多难看 0.6 秒，绝不会永久错。
     */
    private void startAnimWatchdog() {
        uiHandler.removeCallbacksAndMessages(null);
        uiHandler.postDelayed(() -> {
            if (imeAnimating) {
                imeAnimating = false;
                syncFromCurrentInsets();
            }
        }, 600);
    }

    /**
     * 唯一的最终裁决：读系统当前真实的 ime insets，把 WebView 高度校正到与之匹配。
     * 键盘收起 → insets 为 0 → WebView 恢复满屏；键盘弹起 → insets 为键盘高 → 压掉键盘高。
     */
    private void syncFromCurrentInsets() {
        View decor;
        try {
            Window w = getWindow();
            if (w == null) return;
            decor = w.getDecorView();
        } catch (Throwable t) {
            return;
        }
        if (decor == null) return;
        final View d = decor;
        d.post(() -> {
            if (imeAnimating) return; // 新的一轮动画已经开始，让它自己走完
            int imePx = 0;
            try {
                WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(d);
                if (wi != null) imePx = wi.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            } catch (Throwable ignored) {
            }
            resizeWebViewForIme(d, imePx);
        });
    }

    /**
     * 把 WebView 的真实高度压掉键盘高度。
     *
     * 每次 insets 回调都重新算一遍（不是只在键盘变化时），这样旋转屏幕、分屏、
     * 从后台切回来之后高度都能自动修正，不会残留错误值。
     *
     * ⚠️ 基准只能是 fullHeightPx（键盘收起时的整屏高度），不能是 decor.getHeight()。
     *    因为 Manifest 是 adjustResize，键盘弹起时系统可能已经把 decor 缩掉了，
     *    拿缩过的高度再减一次键盘 = 扣两次，WebView 只剩一条缝，下方露出大块深色。
     */
    private void resizeWebViewForIme(View decor, int imePx) {
        if (webView == null || decor == null) return;

        int curH = decor.getHeight();
        int screenH = getRealScreenHeight();

        // ── 交叉校验（专治「键盘收起后 insets 赖着不归零」的 ROM）──
        // 只有当系统确实在帮我们缩窗口（adjustResize 生效）时，才能用 decor 高度反推键盘状态：
        //   · 键盘弹起 → decor 明显变矮  → 记下 systemResizesWindow = true
        //   · 窗口已恢复满屏，insets 却还报着键盘高 → 键盘其实早收起了，直接当 0 处理
        // 反例（系统不缩窗口，decor 始终满屏）不会进这条分支，所以不会把弹起的键盘误判成收起。
        if (imePx > 0 && curH > 0 && fullHeightPx > 0 && curH < fullHeightPx - dpToPx(40)) {
            systemResizesWindow = true;
        }
        if (imePx > 0 && systemResizesWindow && curH > 0 && curH >= fullHeightPx - dpToPx(6)) {
            imePx = 0;
        }

        if (imePx <= 0) {
            // 键盘收起：只有当 decor 高度确实是"整屏"时才当成新基准。
            // 键盘收起动画进行中会回调几次，这时 decor 还没恢复完，采样到就会把基准设小，
            // 下一次弹键盘又扣一次 → 输入栏继续飞。所以用屏幕物理高度交叉校验。
            boolean looksFullScreen = curH > 0 && screenH > 0
                    && Math.abs(curH - screenH) <= Math.max(24, Math.round(screenH * 0.03f));
            if (curH > 0 && (fullHeightPx <= 0 || looksFullScreen)) {
                fullHeightPx = curH;
            }
        } else {
            // 首次回调就处于键盘态（极少见）：物理屏高比缩过的 decor 可靠
            if (fullHeightPx <= 0 && screenH > 0) fullHeightPx = screenH;
            // 键盘弹起时如果 decor 反而更高（少数 ROM 的时序），以更大的为准
            if (curH > 0 && curH > fullHeightPx) fullHeightPx = curH;
        }

        if (fullHeightPx <= 0) {
            fullHeightPx = screenH > 0 ? screenH : getResources().getDisplayMetrics().heightPixels;
        }
        if (fullHeightPx <= 0) return;

        applyWebViewHeight(imePx);
    }

    /**
     * 只负责"把 WebView 高度设成 全屏高 - 键盘高"，不碰基准。
     * 键盘动画期间每帧都会调它（onProgress），所以必须够轻：算出同样的值就直接 return。
     *
     * 双保险：如果系统自己（adjustResize）已经把窗口逐帧缩到目标高度了，
     * 就把 WebView 设成 MATCH_PARENT 跟着窗口走 —— 避免我们和系统各缩一次、两边错帧抖动。
     */
    private void applyWebViewHeight(int imePx) {
        if (webView == null || fullHeightPx <= 0) return;
        int targetH = Math.max(1, fullHeightPx - Math.max(0, imePx));

        int decorH = 0;
        try {
            Window w = getWindow();
            if (w != null) decorH = w.getDecorView().getHeight();
        } catch (Throwable ignored) {
        }
        int wanted = targetH;
        if (decorH > 0 && Math.abs(decorH - targetH) <= 4) {
            // 系统已经缩到位 → 让 WebView 跟着窗口走，别再单独钉死高度
            wanted = ViewGroup.LayoutParams.MATCH_PARENT;
        }

        ViewGroup.LayoutParams lp = webView.getLayoutParams();
        if (lp == null || lp.height == wanted) return;
        lp.height = wanted;
        webView.setLayoutParams(lp);
    }

    /** dp → px（density 在 onCreate 里已经取好） */
    private int dpToPx(float dp) {
        float d = density > 0 ? density : 3f;
        return Math.round(dp * d);
    }

    /** 整屏物理高度（含状态栏 / 导航栏），不受 adjustResize 影响，只用来做交叉校验 */
    private int getRealScreenHeight() {
        try {
            DisplayMetrics m = new DisplayMetrics();
            WindowManager wm = (WindowManager) getSystemService(WINDOW_SERVICE);
            if (wm != null && wm.getDefaultDisplay() != null) {
                wm.getDefaultDisplay().getRealMetrics(m);
                if (m.heightPixels > 0) return m.heightPixels;
            }
        } catch (Throwable ignored) {
        }
        DisplayMetrics fb = getResources().getDisplayMetrics();
        return fb.heightPixels;
    }

    /**
     * 旋转屏幕 / 折叠屏展开时重建基准。
     * Manifest 里配了 configChanges，Activity 不会重建，所以必须在这里手动重置，
     * 否则横屏时还拿竖屏的全屏高度当基准，WebView 会被裁掉一大截。
     */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        if (dm.density > 0) density = dm.density;
        fullHeightPx = getRealScreenHeight();
        ViewCompat.requestApplyInsets(getWindow().getDecorView());
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
