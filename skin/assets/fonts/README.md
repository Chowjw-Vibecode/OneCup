# Bundled typography / 随包字体

The approved boards use several typographic roles. **Noto Serif SC** supplies Song-style headings, substantial controls and numerals. **Noto Sans SC** supplies supporting labels and notes. **Source Serif 4** is retained for the small Latin wordmark. All three families are distributed under the **SIL Open Font License 1.1**, with the original copyright and license files in their respective directories.

确认的设计图并非全部使用宋体。标题、主要控件和大数值使用 Noto Serif SC；说明、弱/强、选填、参数摘要标签及笔记输入使用 Noto Sans SC；英文小字标识使用 Source Serif 4。三套字体均附 SIL Open Font License 1.1 原文。这是根据设计图视觉特征选择的跨设备实现，不是对原始字体的鉴定。

## Roles / 品鉴页字样分类

Values below describe the 1586 × 992 reference viewport. CSS scales the values with viewport width and keeps existing long-name handling.

| Role | Family | Weight | Size at 1586 px |
| --- | --- | --- | --- |
| 当前方案短标题 | Noto Serif SC | 600 | 71.4 px |
| 这一杯的感受 | Noto Serif SC | 600 | 40.0 px |
| 16 / 56 / 34 / 1:3.5 | Noto Serif SC | 600 | 54.0 px |
| 摘要数字后的 g / s | Noto Serif SC | 500 | 28.1 px |
| 粉量 / 实际出液 / 总时间 / 粉液比 | Noto Sans SC | 400 | 23.0 px |
| 关联咖啡豆 / 已关联豆名 | Noto Sans SC | 400 | 23.0 px |
| 喜欢 / 还好 / 不喜欢 | Noto Serif SC | 500 | 25.4 px |
| 酸 / 甜 / 苦 | Noto Serif SC | 600 | 31.7 px |
| 弱 / 强 | Noto Sans SC | 400 | 22.2 px |
| 选填 | Noto Sans SC | 400 | 20.6 px |
| 一句笔记 | Noto Serif SC | 600 | 28.5 px |
| 笔记内容、提示 / 选风味 | Noto Sans SC | 400 | 23.8 px |
| 保存评价 / 结束 | Noto Serif SC | 600 | 40.0 px |
| 蒸汽 / 照这杯再做 / 微调 / 换方案 | Noto Serif SC | 600 | 28.5 px |
| 曲线坐标数字 | Noto Serif SC | 400 | 21.9 px |
| 曲线图例 | Noto Sans SC | 400 | 18.7 px |

Noto Serif SC’s own Latin numerals were compared with Source Serif 4 at the reference 54 px size. Noto’s larger round bowls and stronger vertical strokes are closer to the approved summary figures. We use this one choice consistently for numeric readouts; no font stretching or simulated stroke is applied. A change from 700 to 600 lightens the Chinese headings without changing their size or truncation logic.

## Files and loading

- `notoserifsc/NotoSerifSC-Variable.woff2` — weight 200–900.
- `notosanssc/NotoSansSC-Variable.woff2` — weight 100–900.
- `sourceserif4/SourceSerif4-Variable.woff2` — weight 200–900, optical size 8–60.
- `manifest.json` — source URLs, font versions, sizes, glyph coverage, axes and SHA-256 values.
- `../../typography.css` — local `@font-face` declarations and `--font-ui`, `--font-number`, `--font-caption`, `--font-wordmark` families.

Include `typography.css` after the other skin styles. It loads only package-local font files, with no Google Fonts or other CDN request. All glyphs and variable axes from each downloaded source file are retained. There is no text-based subset, so user-entered profile names are not limited to a preselected list. “Complete” means the original font files’ coverage, not every Unicode character or emoji.

The CSS uses `font-display: swap` and disables synthetic bold/italic. Only upright faces are included. Noto Serif SC uses proportional figures and has no tabular-number feature; the CSS preserves those native shapes. Numeric containers keep the page's existing layout dimensions. Source Serif 4 optical sizing follows the wordmark size.

## Official sources

Downloaded from Google Fonts’ official font repository:

- [Noto Serif SC variable TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf)
- [Noto Serif SC OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt)
- [Noto Sans SC variable TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf)
- [Noto Sans SC OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/OFL.txt)
- [Source Serif 4 variable TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf)
- [Source Serif 4 OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/OFL.txt)

The TTF files were converted to WOFF2 with FontTools and Brotli. No glyphs were edited or removed. The resulting files were reopened and checked against the source character maps and glyph orders. Embedded names and notices are preserved; the `This Cup …` CSS names are local aliases only.
