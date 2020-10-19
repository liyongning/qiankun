/**
 * @author Saviio
 * @since 2020-4-19
 */

// https://developer.mozilla.org/en-US/docs/Web/API/CSSRule
enum RuleType {
  // type: rule will be rewrote
  STYLE = 1,
  MEDIA = 4,
  SUPPORTS = 12,

  // type: value will be kept
  IMPORT = 3,
  FONT_FACE = 5,
  PAGE = 6,
  KEYFRAMES = 7,
  KEYFRAME = 8,
}

const arrayify = <T>(list: CSSRuleList | any[]) => {
  return [].slice.call(list, 0) as T[];
};

export class ScopedCSS {
  private static ModifiedTag = 'Symbol(style-modified-qiankun)';

  private sheet: StyleSheet;

  private swapNode: HTMLStyleElement;

  constructor() {
    const styleNode = document.createElement('style');
    document.body.appendChild(styleNode);

    this.swapNode = styleNode;
    this.sheet = styleNode.sheet!;
    this.sheet.disabled = true;
  }

  /**
   * 拿到样式节点中的所有样式规则，然后重写样式选择器
   *  含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
   *  普通选择器：将前缀插到第一个选择器的后面
   * 
   * 如果发现一个样式节点为空，则该节点的样式内容可能会被动态插入，qiankun 监控了该动态插入的样式，并做了同样的处理
   * 
   * @param styleNode 样式节点
   * @param prefix 前缀 `div[data-qiankun]=${appName}`
   */
  process(styleNode: HTMLStyleElement, prefix: string = '') {
    // 样式节点不为空，即 <style>xx</style>
    if (styleNode.textContent !== '') {
      // 创建一个文本节点，内容为 style 节点内的样式内容
      const textNode = document.createTextNode(styleNode.textContent || '');
      // swapNode 是 ScopedCss 类实例化时创建的一个空 style 节点，将样式内容添加到这个节点下
      this.swapNode.appendChild(textNode);
      /**
       * {
       *  cssRules: CSSRuleList {0: CSSStyleRule, 1: CSSStyleRule, 2: CSSStyleRule, 3: CSSStyleRule, length: 4}
       *  disabled: false
       *  href: null
       *  media: MediaList {length: 0, mediaText: ""}
       *  ownerNode: style
       *  ownerRule: null
       *  parentStyleSheet: null
       *  rules: CSSRuleList {0: CSSStyleRule, 1: CSSStyleRule, 2: CSSStyleRule, 3: CSSStyleRule, length: 4}
       *  title: null
       *  type: "text/css"
       * }
       */
      const sheet = this.swapNode.sheet as any; // type is missing
      /**
       * 得到所有的样式规则，比如
       * [
       *  {selectorText: "body", style: CSSStyleDeclaration, styleMap: StylePropertyMap, type: 1, cssText: "body { background: rgb(255, 255, 255); margin: 0px; }", …}
       *  {selectorText: "#oneGoogleBar", style: CSSStyleDeclaration, styleMap: StylePropertyMap, type: 1, cssText: "#oneGoogleBar { height: 56px; }", …}
       *  {selectorText: "#backgroundImage", style: CSSStyleDeclaration, styleMap: StylePropertyMap, type: 1, cssText: "#backgroundImage { border: none; height: 100%; poi…xed; top: 0px; visibility: hidden; width: 100%; }", …}
       *  {selectorText: "[show-background-image] #backgroundImage {xx}"
       * ]
       */
      const rules = arrayify<CSSRule>(sheet?.cssRules ?? []);
      /**
       * 重写样式选择器
       *  含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
       *  普通选择器：将前缀插到第一个选择器的后面
       */
      const css = this.rewrite(rules, prefix);
      // 用重写后的样式替换原来的样式
      // eslint-disable-next-line no-param-reassign
      styleNode.textContent = css;

      // cleanup
      this.swapNode.removeChild(textNode);
      return;
    }

    /**
     * 
     * 走到这里说明样式节点为空
     */

    // 创建并返回一个新的 MutationObserver 它会在指定的DOM发生变化时被调用
    const mutator = new MutationObserver(mutations => {
      for (let i = 0; i < mutations.length; i += 1) {
        const mutation = mutations[i];

        // 表示该节点已经被 qiankun 处理过，后面就不会再被重复处理
        if (ScopedCSS.ModifiedTag in styleNode) {
          return;
        }

        // 如果是子节点列表发生变化
        if (mutation.type === 'childList') {
          // 拿到 styleNode 下的所有样式规则，并重写其样式选择器，然后用重写后的样式替换原有样式
          const sheet = styleNode.sheet as any;
          const rules = arrayify<CSSRule>(sheet?.cssRules ?? []);
          const css = this.rewrite(rules, prefix);

          // eslint-disable-next-line no-param-reassign
          styleNode.textContent = css;
          // 给 styleNode 添加一个 ScopedCss.ModifiedTag 属性，表示已经被 qiankun 处理过，后面就不会再被处理了
          // eslint-disable-next-line no-param-reassign
          (styleNode as any)[ScopedCSS.ModifiedTag] = true;
        }
      }
    });

    // since observer will be deleted when node be removed
    // we dont need create a cleanup function manually
    // see https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver/disconnect
    // 观察 styleNode 节点，当其子节点发生变化时调用 callback 即 实例化时传递的函数
    mutator.observe(styleNode, { childList: true });
  }

  /**
   * 重写样式选择器，都是在 ruleStyle 中处理的：
   *  含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
   *  普通选择器：将前缀插到第一个选择器的后面
   * 
   * @param rules 样式规则
   * @param prefix 前缀 `div[data-qiankun]=${appName}`
   */
  private rewrite(rules: CSSRule[], prefix: string = '') {
    let css = '';

    rules.forEach(rule => {
      // 几种类型的样式规则，所有类型查看 https://developer.mozilla.org/zh-CN/docs/Web/API/CSSRule#%E7%B1%BB%E5%9E%8B%E5%B8%B8%E9%87%8F
      switch (rule.type) {
        // 最常见的 selector { prop: val }
        case RuleType.STYLE:
          /**
           * 含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
           * 普通选择器：将前缀插到第一个选择器的后面
           */
          css += this.ruleStyle(rule as CSSStyleRule, prefix);
          break;
        // 媒体 @media screen and (max-width: 300px) { prop: val }
        case RuleType.MEDIA:
          // 拿到其中的具体样式规则，然后调用 rewrite 通过 ruleStyle 去处理
          css += this.ruleMedia(rule as CSSMediaRule, prefix);
          break;
        // @supports (display: grid) {}
        case RuleType.SUPPORTS:
          // 拿到其中的具体样式规则，然后调用 rewrite 通过 ruleStyle 去处理
          css += this.ruleSupport(rule as CSSSupportsRule, prefix);
          break;
        // 其它，直接返回样式内容
        default:
          css += `${rule.cssText}`;
          break;
      }
    });

    return css;
  }

  /**
   * 普通的根选择器用前缀代替
   * 根组合选择器置空，忽略非标准形式的兄弟选择器，比如 html + body {...}
   * 针对普通选择器则是在第一个选择器后面插入前缀，比如 .xx 变成 .xxprefix
   * 
   * 总结就是：
   *  含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
   *  普通选择器：将前缀插到第一个选择器的后面
   * 
   * handle case:
   * .app-main {}
   * html, body {}
   * 
   * @param rule 比如：.app-main {} 或者 html, body {}
   * @param prefix `div[data-qiankun]=${appName}`
   */
  // eslint-disable-next-line class-methods-use-this
  private ruleStyle(rule: CSSStyleRule, prefix: string) {
    // 根选择，比如 html、body、:root
    const rootSelectorRE = /((?:[^\w\-.#]|^)(body|html|:root))/gm;
    // 根组合选择器，比如 html body {...} 、 html > body {...}
    const rootCombinationRE = /(html[^\w{[]+)/gm;

    // 选择器
    const selector = rule.selectorText.trim();

    // 样式文本
    let { cssText } = rule;

    // 如果选择器为根选择器，则直接用前缀将根选择器替换掉
    // handle html { ... }
    // handle body { ... }
    // handle :root { ... }
    if (selector === 'html' || selector === 'body' || selector === ':root') {
      return cssText.replace(rootSelectorRE, prefix);
    }

    // 根组合选择器
    // handle html body { ... }
    // handle html > body { ... }
    if (rootCombinationRE.test(rule.selectorText)) {
      // 兄弟选择器 html + body，非标准选择器，无效，转换时忽略
      const siblingSelectorRE = /(html[^\w{]+)(\+|~)/gm;

      // since html + body is a non-standard rule for html
      // transformer will ignore it
      if (!siblingSelectorRE.test(rule.selectorText)) {
        // 说明时 html + body 这种非标准形式，则将根组合器置空
        cssText = cssText.replace(rootCombinationRE, '');
      }
    }

    // 其它一般选择器，比如 类选择器、id 选择器、元素选择器、组合选择器等
    // handle grouping selector, a,span,p,div { ... }
    cssText = cssText.replace(/^[\s\S]+{/, selectors =>
      // item 是匹配的字串，p 是第一个分组匹配的内容，s 是第二个分组匹配的内容
      selectors.replace(/(^|,\n?)([^,]+)/g, (item, p, s) => {
        // handle div,body,span { ... }
        if (rootSelectorRE.test(item)) {
          // 说明选择器中含有根元素选择器
          return item.replace(rootSelectorRE, m => {
            // do not discard valid previous character, such as body,html or *:not(:root)
            const whitePrevChars = [',', '('];

            // 将其中的根元素替换为前缀
            if (m && whitePrevChars.includes(m[0])) {
              return `${m[0]}${prefix}`;
            }

            // replace root selector with prefix
            return prefix;
          });
        }

        // selector1 selector2 =》 selector1prefix selector2
        return `${p}${prefix} ${s.replace(/^ */, '')}`;
      }),
    );

    return cssText;
  }

  // 拿到其中的具体样式规则，然后调用 rewrite 通过 ruleStyle 去处理
  // handle case:
  // @media screen and (max-width: 300px) {}
  private ruleMedia(rule: CSSMediaRule, prefix: string) {
    const css = this.rewrite(arrayify(rule.cssRules), prefix);
    return `@media ${rule.conditionText} {${css}}`;
  }

  // 拿到其中的具体样式规则，然后调用 rewrite 通过 ruleStyle 去处理
  // handle case:
  // @supports (display: grid) {}
  private ruleSupport(rule: CSSSupportsRule, prefix: string) {
    const css = this.rewrite(arrayify(rule.cssRules), prefix);
    return `@supports ${rule.conditionText} {${css}}`;
  }
}

let processor: ScopedCSS;

export const QiankunCSSRewriteAttr = 'data-qiankun';
/**
 * 做了两件事：
 *  实例化 processor = new ScopedCss，真正处理样式选择器的地方
 *  生成样式前缀 `div[data-qiankun]=${appName}`
 * @param appWrapper = <div id="__qiankun_microapp_wrapper_for_${appInstanceId}__" data-name="${appName}">${template}</div>
 * @param stylesheetElement = <style>xx</style>
 * @param appName 微应用名称
 */
export const process = (
  appWrapper: HTMLElement,
  stylesheetElement: HTMLStyleElement | HTMLLinkElement,
  appName: string,
) => {
  // lazy singleton pattern，单例模式
  if (!processor) {
    processor = new ScopedCSS();
  }

  // 目前支持 style 标签
  if (stylesheetElement.tagName === 'LINK') {
    console.warn('Feature: sandbox.experimentalStyleIsolation is not support for link element yet.');
  }

  // 微应用模版
  const mountDOM = appWrapper;
  if (!mountDOM) {
    return;
  }

  // div
  const tag = (mountDOM.tagName || '').toLowerCase();

  if (tag && stylesheetElement.tagName === 'STYLE') {
    // 生成前缀 `div[data-qiankun]=${appName}`
    const prefix = `${tag}[${QiankunCSSRewriteAttr}="${appName}"]`;
    /**
     * 实际处理样式的地方
     * 拿到样式节点中的所有样式规则，然后重写样式选择器
     *  含有根元素选择器的情况：用前缀替换掉选择器中的根元素选择器部分，
     *  普通选择器：将前缀插到第一个选择器的后面
     */
    processor.process(stylesheetElement, prefix);
  }
};
