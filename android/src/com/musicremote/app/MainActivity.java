package com.musicremote.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String BG = "#08080A";
    private FrameLayout root;
    private WebView web;
    private LinearLayout setup;
    private EditText input;
    private TextView status;
    private SharedPreferences sp;

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("cfg", Context.MODE_PRIVATE);
        int bg = Color.parseColor(BG);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(bg);
            getWindow().setNavigationBarColor(bg);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(bg);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        web.setBackgroundColor(bg);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, int code, String desc, String url) {
                showSetup("连接不上电脑：" + desc);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (Build.VERSION.SDK_INT >= 21 && req.isForMainFrame()) {
                    showSetup("连接不上电脑：" + err.getDescription());
                }
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                hideSetup();
            }
        });
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                showSetup(null);
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        buildSetup();
        setContentView(root);
        String url = sp.getString("url", "");
        if (url.length() == 0) showSetup(null);
        else web.loadUrl(url);
    }

    private void buildSetup() {
        setup = new LinearLayout(this);
        setup.setOrientation(LinearLayout.VERTICAL);
        setup.setGravity(Gravity.CENTER);
        setup.setBackgroundColor(Color.parseColor(BG));
        setup.setPadding(dp(30), dp(30), dp(30), dp(30));
        setup.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("网易云遥控");
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setGravity(Gravity.CENTER);
        setup.addView(title);

        TextView sub = new TextView(this);
        sub.setText("输入电脑上显示的地址");
        sub.setTextColor(Color.parseColor("#8b8b95"));
        sub.setTextSize(13);
        sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(10);
        setup.addView(sub, lp);

        input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("192.168.1.5:3040");
        input.setHintTextColor(Color.parseColor("#5a5a63"));
        input.setTextColor(Color.WHITE);
        input.setTextSize(16);
        input.setGravity(Gravity.CENTER);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(26);
        setup.addView(input, lp);

        Button go = new Button(this);
        go.setText("连接");
        go.setAllCaps(false);
        go.setTextSize(16);
        go.setBackgroundColor(Color.parseColor("#ff3b4e"));
        go.setTextColor(Color.WHITE);
        go.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                connect(input.getText().toString());
            }
        });
        lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        lp.topMargin = dp(20);
        setup.addView(go, lp);

        status = new TextView(this);
        status.setTextColor(Color.parseColor("#ff7a86"));
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER);
        lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        setup.addView(status, lp);

        TextView tip = new TextView(this);
        tip.setText("电脑上双击 start.bat 启动后，把控制台里的局域网地址填到这里。\n连上以后长按页面可重新设置。");
        tip.setTextColor(Color.parseColor("#6a6a74"));
        tip.setTextSize(12);
        tip.setGravity(Gravity.CENTER);
        lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(28);
        setup.addView(tip, lp);

        root.addView(setup, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        input.setText(sp.getString("raw", ""));
    }

    private void connect(String raw) {
        String v = raw == null ? "" : raw.trim();
        if (v.length() == 0) {
            Toast.makeText(this, "请输入电脑地址", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://" + v;
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        sp.edit().putString("url", v + "/").putString("raw", raw.trim()).apply();
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
        setup.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(v + "/");
    }

    private void showSetup(String msg) {
        if (setup == null) return;
        if (status != null) {
            status.setText(msg == null ? "" : msg);
            status.setVisibility(msg == null ? View.GONE : View.VISIBLE);
        }
        if (input != null) input.setText(sp.getString("raw", ""));
        setup.setVisibility(View.VISIBLE);
        web.setVisibility(View.GONE);
    }

    private void hideSetup() {
        if (setup != null) setup.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
    }

    @Override
    public void onBackPressed() {
        if (setup != null && setup.getVisibility() == View.VISIBLE) {
            if (sp.getString("url", "").length() == 0) {
                super.onBackPressed();
            } else {
                hideSetup();
            }
            return;
        }
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
