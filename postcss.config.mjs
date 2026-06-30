const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // 放在 @tailwindcss/postcss 之后：把 Tailwind v4 产出的现代 CSS（oklch
    // 颜色、CSS 原生嵌套等）依据 browserslist 降级为 Chrome 109 等老浏览器
    // 可识别的 rgb()/平铺选择器，并补充必要的厂商前缀。
    //
    // 注意：不能用 Next.js 的 experimental.useLightningcss，它会与 Tailwind v4
    // 内部的 lightningcss 冲突（tailwindcss#17046）。这里复用 Tailwind v4 已
    // 间接安装的 lightningcss，仅在 PostCSS 链路叠加一层降级。
    //
    // minify / sourceMap 交给 Next.js 自身管理，此处关闭以免重复处理冲突。
    "postcss-lightningcss": {
      // browsers 留空 → 自动读取 package.json 的 browserslist 字段
      lightningcssOptions: {
        minify: false,
        sourceMap: false,
        drafts: {
          // 启用嵌套解析，使 lightningcss 能把 Tailwind 输出的原生嵌套
          // 展开为老浏览器可识别的平铺选择器（Chrome 112+ 才支持原生嵌套）。
          nesting: true,
        },
      },
    },
  },
};

export default config;
