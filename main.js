/*
 * 鲸鱼钱包 — ToolPkg 入口
 * 注册侧边栏 UI 路由与导航入口
 *
 * 注意：注册模式（parseToolPkg）下 require() 返回的是带
 * __operit_toolpkg_module_path 的“模块引用函数”，可直接序列化；
 * 普通加载模式下 require() 返回模块导出对象（含 default）。
 * 这里统一兼容两种形态。
 */
var uiRef = require("./ui/whale_purse/index.ui.js");

function resolveScreenRef(mod) {
    if (typeof mod === "function" && mod.__operit_toolpkg_module_path) {
        return mod;
    }
    if (mod && typeof mod.default === "function") {
        return mod.default;
    }
    if (mod && typeof mod.Screen === "function") {
        return mod.Screen;
    }
    if (typeof mod === "function") {
        return mod;
    }
    return mod;
}

var Screen = resolveScreenRef(uiRef);

function registerToolPkg() {
    ToolPkg.registerUiRoute({
        id: "whale_purse",
        runtime: "compose_dsl",
        screen: Screen,
        params: {},
        title: {
            zh: "鲸鱼娘钱包",
            en: "Whale Purse (DeepSeek Balance)",
        }
    });
    ToolPkg.registerNavigationEntry({
        id: "whale_purse_entry",
        route: "toolpkg:com.operit.whale_purse:ui:whale_purse",
        surface: "main_sidebar_plugins",
        title: {
            zh: "鲸鱼娘钱包",
            en: "Whale Purse",
        },
        icon: "monitoring",
        order: 40,
    });
    return true;
}

exports.registerToolPkg = registerToolPkg;