"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Screen;

var autoKey = require("../../shared/auto_key.js");
var balanceApi = require("../../shared/balance_api.js");

/*
 * DeepSeek 鲸鱼钱包 — 余额桌宠 v2.4
 *
 * 视觉：整页就是一只浮在柔和渐变上的小鲸鱼（头顶余额气泡、脚底投影），
 *      底部一条状态行 + 右下角一枚低调的设置入口。无任何技术性文字。
 * 交互：点击鲸鱼（弹跳 + 刷新）/ 每 30 秒自动刷新 / ⚙ 自定义提醒额度。
 * 警示：余额 < 告警额度时黄色气泡；< 告急额度时红色气泡
 *      （默认告警 10 元、告急 5 元，可在设置面板自定义）。
 * 架构：WebView(CSS/JS) ←→ 宿主（读取 Key、查询余额、读写设置文件；
 *      evaluateJavascript 注入数据 / console 消息通道回传指令）。
 */
function Screen(ctx) {
    var UI = ctx.UI;
    var useRef = ctx.useRef;

    var ctrlRef = useRef("wp_ctrl", { ctrl: null });
    var htmlRef = useRef("wp_html", { html: null, spriteTried: false });
    var ctlRef = useRef("wp_ctl", { queue: null });

    var SPRITE_PATH = "/sdcard/Download/Operit/plugins/com.operit.whale_purse/whale-sprite.png";
    var DEFAULT_YELLOW = 10;  // 默认告警额度：余额低于 10 元黄色气泡
    var DEFAULT_RED = 5;      // 默认告急额度：余额低于 5 元红色气泡

    function settingsDir() {
        try {
            if (typeof ToolPkg !== "undefined" && ToolPkg && ToolPkg.getConfigDir) {
                var d = ToolPkg.getConfigDir();
                if (d) return d;
            }
        } catch (e) { }
        return "/sdcard/Download/Operit/plugins/com.operit.whale_purse";
    }

    function settingsFile() {
        return settingsDir() + "/settings.json";
    }

    async function loadSettings() {
        try {
            var res = await Tools.Files.read(settingsFile());
            var content = res && res.content ? res.content : "";
            if (content) {
                var o = JSON.parse(content);
                var y = Number(o.yellowBelow);
                var r = Number(o.redBelow);
                if (isFinite(y) && isFinite(r) && y > 0 && r > 0 && r < y) {
                    return { yellowBelow: y, redBelow: r };
                }
            }
        } catch (e) { }
        return { yellowBelow: DEFAULT_YELLOW, redBelow: DEFAULT_RED };
    }

    function saveSettings(y, r) {
        var content = JSON.stringify({ yellowBelow: y, redBelow: r });
        try {
            var dir = settingsDir();
            try { Tools.Files.mkdir(dir, true); } catch (e) { }
            try { Tools.Files.write(settingsFile(), content, false); } catch (e) { }
        } catch (e) { }
    }

    function handleSaveSettings(jsonStr) {
        var data = null;
        try { data = JSON.parse(jsonStr); } catch (e) { }
        var y = data ? Number(data.yellowBelow) : NaN;
        var r = data ? Number(data.redBelow) : NaN;
        if (!isFinite(y) || !isFinite(r) || y <= 0 || r <= 0 || r >= y) {
            inject("window.setSaveResult('err'," + JSON.stringify("参数无效") + ");");
            return;
        }
        saveSettings(y, r);
    }

    function ensureController() {
        if (!ctx.createWebViewController) return null;
        if (ctrlRef.current.ctrl) return ctrlRef.current.ctrl;
        try {
            var c = ctx.createWebViewController("wpwv");
            ctrlRef.current.ctrl = c;
            return c;
        } catch (e) {
            return null;
        }
    }

    function inject(js) {
        var c = ensureController();
        if (c && c.evaluateJavascript) {
            try { c.evaluateJavascript(js); return true; } catch (e) { return false; }
        }
        return false;
    }

    function buildHtml() {
        var imgTag = "<img id=\"whale\" alt=\"\" src=\"file:///sdcard/Download/Operit/plugins/com.operit.whale_purse/whale-sprite.png\"/>";
        return [
            "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>",
            "<style>",
            "*{box-sizing:border-box;margin:0;padding:0;}",
            "html,body{height:100%;overflow:hidden;font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;}",
            "body{background:linear-gradient(180deg,#E9F0FF 0%,#F3F8FF 52%,#FFFFFF 100%);display:flex;flex-direction:column;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}",
            "#stage{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 18px 6px;min-height:0;}",
            "#whale-wrap{position:relative;width:min(168px,70vw);cursor:pointer;animation:bob 3.6s ease-in-out infinite;transform-origin:50% 95%;}",
            "#whale-jump{position:relative;width:100%;transform-origin:50% 100%;}",
            "#whale{display:block;width:100%;height:auto;pointer-events:none;filter:drop-shadow(0 16px 24px rgba(37,80,180,.16));}",
            "#whalefb{display:none;width:100%;height:auto;aspect-ratio:1;background:radial-gradient(circle at 35% 40%,#6B8AFE 0%,#4D6BFE 60%,#3A54D8 100%);border-radius:52% 52% 46% 46%;position:relative;}",
            "#whalefb::after{content:'';position:absolute;left:40px;top:58px;width:24px;height:24px;background:#fff;border-radius:50%;box-shadow:0 0 0 7px #1B2A5B inset;}",
            "#shadow{position:absolute;left:50%;bottom:-12px;width:110px;height:18px;margin-left:-55px;background:radial-gradient(ellipse at center, rgba(37,80,180,.20) 0%, rgba(37,80,180,0) 68%);border-radius:50%;pointer-events:none;}",
            "#pill{position:absolute;top:-48px;left:50%;transform:translateX(-50%);display:inline-flex;align-items:center;padding:8px 16px;background:#1B2A5B;color:#fff;border-radius:999px;font-weight:700;font-size:19px;letter-spacing:.01em;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 10px 22px rgba(27,42,91,.26);transition:background .25s,box-shadow .25s;}",
            "#pill::after{content:'';position:absolute;bottom:-5px;left:50%;margin-left:-6px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #1B2A5B;transition:border-top-color .25s;}",
            "#pill.warn{background:#FFC53D;color:#5C4300;box-shadow:0 10px 22px rgba(230,170,20,.30);animation:pulse 1.8s ease-in-out infinite;}",
            "#pill.warn::after{border-top-color:#FFC53D;}",
            "#pill.danger{background:#C62828;box-shadow:0 10px 22px rgba(198,40,40,.32);animation:pulse 1.8s ease-in-out infinite;}",
            "#pill.danger::after{border-top-color:#C62828;}",
            "@keyframes pulse{0%,100%{transform:translateX(-50%) scale(1);}50%{transform:translateX(-50%) scale(1.05);}}",
            "@keyframes bob{0%,100%{transform:translateY(0) rotate(-1.6deg);}50%{transform:translateY(-9px) rotate(1.6deg);}}",
            "#whale-jump.wp-tap{animation:tap .5s ease-out;}",
            "@keyframes tap{0%{transform:translateY(0) scale(1);}25%{transform:translateY(-13px) scale(1.07,.93);}55%{transform:translateY(0) scale(.96,1.04);}100%{transform:translateY(0) scale(1);}}",
            "#status-wrap{text-align:center;padding:14px 22px 34px;}",
            "#status{font-size:12.5px;color:#8593B8;letter-spacing:.02em;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:6px;}",
            "#status .dot{width:6px;height:6px;border-radius:50%;background:#9DB1D8;flex:none;transition:background .25s;}",
            "#status.ok .dot{background:#34C759;}",
            "#status.warn .dot{background:#F5B301;}",
            "#status.danger .dot{background:#FF453A;}",
            "#status.err .dot{background:#FF453A;}",
            "#status.warn{color:#8A6400;}",
            "#status.danger{color:#C62828;}",
            "#status.err{color:#C62828;}",
            "#gear{position:fixed;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#9AA8CC;font-size:18px;line-height:1;background:rgba(27,42,91,.06);cursor:pointer;z-index:5;transition:background .15s;-webkit-tap-highlight-color:transparent;}",
            "#gear:active{background:rgba(27,42,91,.14);}",
            "#overlay{position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(16,24,48,.38);display:none;align-items:flex-start;justify-content:center;padding-top:12vh;z-index:10;overflow-y:auto;}",
            "#overlay.show{display:flex;}",
            "#settings{width:78%;max-width:300px;background:#FFFFFF;border-radius:18px;padding:16px 16px 14px;box-shadow:0 18px 50px rgba(16,24,48,.35);}",
            "#settings h3{font-size:15px;color:#1B2A5B;margin:0 0 12px;font-weight:700;text-align:center;}",
            ".set-row{margin-bottom:10px;}",
            ".set-row label{display:block;font-size:12px;color:#7484AC;margin-bottom:5px;}",
            ".set-row input{width:100%;padding:9px 12px;border:1px solid #D8E0F2;border-radius:10px;font-size:16px;color:#1B2A5B;background:#F7F9FF;outline:none;font-family:inherit;}",
            ".set-row input:focus{border-color:#4D6BFE;background:#FFFFFF;}",
            "#setMsg{min-height:17px;font-size:11.5px;color:#C62828;text-align:center;margin:2px 0 6px;}",
            "#setMsg.ok{color:#2E9E5B;}",
            ".set-btns{display:flex;gap:10px;}",
            ".set-btns button{flex:1;padding:10px 0;border:none;border-radius:999px;font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
            "#btnCancel{background:rgba(77,107,254,.08);color:#5B6B95;}",
            "#btnCancel:active{background:rgba(77,107,254,.16);}",
            "#btnSave{background:#4D6BFE;color:#FFFFFF;}",
            "#btnSave:active{background:#3A54D8;}",
            "@media (max-height:560px){#whale-wrap{width:104px;}#pill{font-size:16px;top:-42px;padding:6px 12px;}#shadow{width:80px;margin-left:-40px;}}",
            "@media (prefers-color-scheme: dark){",
            "body{background:linear-gradient(180deg,#1A2238 0%,#1E2742 52%,#232D4D 100%);}",
            "#status{color:#8B99C2;}",
            "#status.warn{color:#FFD666;}",
            "#status.danger{color:#FF6B61;}",
            "#status.err{color:#FF6B61;}",
            "#gear{background:rgba(157,180,255,.10);color:#8B99C2;}",
            "#settings{background:#232D4D;box-shadow:0 18px 50px rgba(0,0,0,.5);}",
            "#settings h3{color:#E5EAFF;}",
            ".set-row label{color:#8B99C2;}",
            ".set-row input{background:#1B2440;border-color:#2E3A5E;color:#DCE4FF;}",
            ".set-row input:focus{border-color:#6B8AFE;background:#1E2742;}",
            "#setMsg{color:#FF6B61;}",
            "#setMsg.ok{color:#4CD97B;}",
            "#btnCancel{background:rgba(120,150,255,.12);color:#9DB4FF;}",
            "}",
            "</style></head><body>",
            "<div id=\"stage\">",
            "  <div id=\"whale-wrap\">",
            "    <div id=\"whale-jump\">",
            "    <div id=\"pill\">￥ --</div>",
            "    " + imgTag,
            "    <div id=\"whalefb\"></div>",
            "    </div>",
            "    <div id=\"shadow\"></div>",
            "  </div>",
            "</div>",
            "<div id=\"status-wrap\"><div id=\"status\"><span class=\"dot\"></span><span id=\"status-text\">正在获取余额…</span></div></div>",
            "<div id=\"gear\">\u2699</div>",
            "<div id=\"overlay\">",
            "  <div id=\"settings\">",
            "    <h3>提醒设置</h3>",
            "    <div class=\"set-row\"><label>告警额度（余额低于它显示黄色气泡）</label><input id=\"inY\" type=\"number\" min=\"0\" step=\"0.5\" inputmode=\"decimal\"/></div>",
            "    <div class=\"set-row\"><label>告急额度（余额低于它显示红色气泡）</label><input id=\"inR\" type=\"number\" min=\"0\" step=\"0.5\" inputmode=\"decimal\"/></div>",
            "    <div id=\"setMsg\"></div>",
            "    <div class=\"set-btns\"><button id=\"btnCancel\">取消</button><button id=\"btnSave\">保存</button></div>",
            "  </div>",
            "</div>",
            "<script>",
            "window.setBalance=function(s){document.getElementById('pill').textContent=s;};",
            "window.setStatus=function(s,level){var st=document.getElementById('status');var tx=document.getElementById('status-text');tx.textContent=s;st.className=level||'';};",
            "window.setWarn=function(level){var p=document.getElementById('pill');if(!p)return;p.classList.remove('warn','danger');if(level==='warn'){p.classList.add('warn');}else if(level==='danger'){p.classList.add('danger');}};",
            "window.setBusy=function(){};",
            "var TH={yellow:10,red:5};",
            "var lastBal=null;",
            "function renderBal(){",
            "  if(!lastBal)return;",
            "  var level='ok',pillLevel='',statusText='更新于 '+lastBal.now+' · 余额可用';",
            "  if(!lastBal.avail){level='err';statusText='账户不可用，请检查账户状态';}",
            "  else if(lastBal.num<TH.red){level='danger';pillLevel='danger';statusText='余额告急，请尽快充值 · 更新于 '+lastBal.now;}",
            "  else if(lastBal.num<TH.yellow){level='warn';pillLevel='warn';statusText='余额偏低，建议及时充值 · 更新于 '+lastBal.now;}",
            "  setBalance(lastBal.txt);setStatus(statusText,level);setWarn(pillLevel);",
            "}",
            "window.updateBalance=function(txt,num,avail,now){lastBal={txt:txt,num:Number(num)||0,avail:!!avail,now:now};renderBal();};",
            "window.setThresholds=function(y,r){var yy=Number(y),rr=Number(r);if(isFinite(yy)&&isFinite(rr)&&yy>0&&rr>0){TH.yellow=yy;TH.red=rr;renderBal();}};",
            "window.setSaveResult=function(state,msg){",
            "  var m=document.getElementById('setMsg');",
            "  if(state==='ok'){m.textContent='已保存 ✓';m.className='ok';setTimeout(function(){document.getElementById('overlay').classList.remove('show');},650);}",
            "  else{m.textContent=msg||'保存失败';m.className='';}",
            "};",
            "var wrap=document.getElementById('whale-wrap');",
            "var jump=document.getElementById('whale-jump');",
            "var tapTimer=null;",
            "wrap.addEventListener('click',function(){",
            "  jump.classList.remove('wp-tap');void jump.offsetWidth;jump.classList.add('wp-tap');",
            "  if(tapTimer){clearTimeout(tapTimer);}",
            "  tapTimer=setTimeout(function(){jump.classList.remove('wp-tap');tapTimer=null;},520);",
            "  try{console.log('WP_CMD:refresh');}catch(e){}",
            "});",
            "setInterval(function(){try{console.log('WP_CMD:refresh');}catch(e){}},30000);",
            "var gear=document.getElementById('gear');",
            "var overlay=document.getElementById('overlay');",
            "gear.addEventListener('click',function(){",
            "  document.getElementById('inY').value=TH.yellow;",
            "  document.getElementById('inR').value=TH.red;",
            "  var m=document.getElementById('setMsg');m.textContent='';m.className='';",
            "  overlay.classList.add('show');",
            "});",
            "document.getElementById('btnCancel').addEventListener('click',function(){overlay.classList.remove('show');});",
            "overlay.addEventListener('click',function(e){if(e.target===overlay){overlay.classList.remove('show');}});",
            "document.getElementById('btnSave').addEventListener('click',function(){",
            "  var y=Number(document.getElementById('inY').value),r=Number(document.getElementById('inR').value);",
            "  var m=document.getElementById('setMsg');",
            "  if(!isFinite(y)||y<=0||!isFinite(r)||r<=0){m.textContent='请输入大于 0 的数值';m.className='';return;}",
            "  if(r>=y){m.textContent='告急额度需小于告警额度';m.className='';return;}",
            "  TH.yellow=y;TH.red=r;renderBal();",
            "  m.textContent='已保存 ✓';m.className='ok';",
            "  try{console.log('WP_CMD:save'+JSON.stringify({yellowBelow:y,redBelow:r}));}catch(e){}",
            "  setTimeout(function(){document.getElementById('overlay').classList.remove('show');},650);",
            "});",
            "var wimg=document.getElementById('whale');",
            "if(wimg&&wimg.tagName==='IMG'){wimg.addEventListener('error',function(){wimg.style.display='none';var fb=document.getElementById('whalefb');if(fb){fb.style.display='block';}});}",
            "try{console.log('WP_CMD:ready');}catch(e){}",
            "</script>",
            "</body></html>",
        ].join("");
    }

    function refreshBalance(reason) {
        var prev = ctlRef.current.queue || Promise.resolve();
        var next = prev.then(function () { return doRefresh(reason); }).catch(function () { });
        ctlRef.current.queue = next;
        return next;
    }

    async function doRefresh(reason) {
        inject("window.setBusy(true);");
        try {
            var key = "";
            try { key = await autoKey.autoReadDeepSeekKey() || ""; } catch (e) { }
            if (!key) {
                inject("window.setBusy(false);"
                    + "window.setStatus(" + JSON.stringify("未配置 DeepSeek API Key，请先在 Operit 中添加模型") + ", 'err');"
                    + "window.setWarn('danger');");
                return;
            }
            var res = await balanceApi.fetchBalance({
                apiKey: key,
                provider: "deepseek",
                http: function (e) { return Tools.Net.http(e); },
            });
            if (res && res.ok && res.data) {
                var num = Number(res.data.balanceNum) || 0;
                var txt = "\u00a5" + res.data.balance;
                var now = new Date().toLocaleTimeString();
                var avail = res.data.isAvailable !== false;
                inject("window.setBusy(false);"
                    + "window.updateBalance(" + JSON.stringify(txt) + ", " + num + ", " + (avail ? "true" : "false") + ", " + JSON.stringify(now) + ");");
            } else {
                inject("window.setBusy(false);"
                    + "window.setStatus(" + JSON.stringify("查询失败，请稍后重试") + ", 'err');");
            }
        } catch (e) {
            inject("window.setBusy(false);"
                + "window.setStatus(" + JSON.stringify("网络异常，请稍后重试") + ", 'err');");
        }
    }

    if (!htmlRef.current.html) {
        htmlRef.current.html = buildHtml();
    }

    function maybeInitSprite() {
        if (htmlRef.current.spriteDone) return;
        htmlRef.current.spriteDone = true;
        try {
            var pr = ToolPkg.readResource("whale_sprite");
            if (pr && pr.then) {
                pr.then(function (path) {
                    if (path) {
                        var p = String(path);
                        var url = (p.indexOf("file://") === 0) ? p : ("file://" + p);
                        var prev = ctlRef.current.queue || Promise.resolve();
                        ctlRef.current.queue = prev.then(function () {
                            inject("var w=document.getElementById('whale');if(w){w.style.display='block';var fb=document.getElementById('whalefb');if(fb){fb.style.display='none';}w.setAttribute('src'," + JSON.stringify(url) + ");}");
                        }).catch(function () { });
                    }
                }).catch(function () { });
            }
        } catch (e) { }
    }

    function maybeSendThresholds() {
        if (htmlRef.current.thSent) return;
        loadSettings().then(function (st) {
            var prev = ctlRef.current.queue || Promise.resolve();
            ctlRef.current.queue = prev.then(function () {
                var ok = inject("window.setThresholds(" + st.yellowBelow + ", " + st.redBelow + ");");
                if (ok) htmlRef.current.thSent = true;
            }).catch(function () { });
        }).catch(function () { });
    }

    async function onLoadFlow() {
        ensureController();
        if (!htmlRef.current.spriteTried) {
            htmlRef.current.spriteTried = true;
            try {
                var ex = await Tools.Files.exists(SPRITE_PATH);
                var has = ex && (typeof ex === "object" ? ex.exists : ex);
                if (!has) {
                    inject("window.setStatus(" + JSON.stringify("立绘文件缺失，已使用备用形象") + ", 'warn');");
                }
            } catch (e) { }
        }
    }

    var ctrl = ctrlRef.current.ctrl || ensureController();

    return UI.WebView({
        html: htmlRef.current.html,
        fillMaxSize: true,
        javascriptEnabled: true,
        domStorageEnabled: true,
        allowFileAccess: true,
        allowFileAccessFromFileURLs: true,
        allowUniversalAccessFromFileURLs: true,
        controller: ctrlRef.current.ctrl || undefined,
        onConsoleMessage: function (e) {
            try {
                var msg = String(e && e.message || "");
                if (msg.indexOf("WP_CMD:") === 0) {
                    var cmd = msg.slice(7).trim();
                    if (cmd === "ready") {
                        maybeInitSprite();
                        maybeSendThresholds();
                        refreshBalance(cmd);
                    } else if (cmd === "refresh") {
                        maybeSendThresholds();
                        refreshBalance(cmd);
                    } else if (cmd.indexOf("save") === 0) {
                        handleSaveSettings(cmd.slice(4));
                    }
                }
            } catch (e1) { }
        },
        onLoad: async function () {
            await onLoadFlow();
        },
    });
}