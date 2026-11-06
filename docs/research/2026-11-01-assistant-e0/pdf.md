# PDF提取验证边界

日期：2026-11-01。作者与版权所有者：朱春茂。

本机python已有pypdf 6.19.0；安装包许可元数据：BSD-3-Clause。pdftotext可执行文件：未发现；reportlab与pdfplumber未发现。本轮未安装任何提取器／OCR。

已实现独立字段比较器：产品、规格、精确单价字符串、币种、单位、页码、条件、源版本逐项匹配，支持不同排列，拒绝漏行和重复行。虚构JSON基准为Synthetic Resin USD 12.30/kg及Synthetic Sample USD 0.10/pc；不会发布或写入ERP。

追加实际提取：使用 experiments/assistant-e0/pdf-text-probe.py 在临时目录生成一份明确标记SYNTHETIC的单页文本PDF，通过本机pypdf提取两行，以独立JSON基准逐字段比较，16个字段全部一致。命令：python3 experiments/assistant-e0/pdf-text-probe.py /private/tmp/reselat-e0-pdf-text。未提供企业资料，没有模型调用。测试PDF不是对外交付文件，不作视觉排版验收。

此结果仅证明该单页、分隔符清晰的虚构文本样本可读取。企业PDF、复杂表格、跨页、乱码、扫描OCR仍unverified，不能宣称通用PDF识别能力或给出准确率。

后续E1前使用独立虚构文本表格PDF与扫描PDF，分别保存人工基准、页码、提取引擎／版本和字段差异。先验证已有pypdf文本能力，若布局无法保留须人工校正；扫描引擎另经依赖评审选择。任何抽取结果均待审核，exact=true也不能作为发布许可。
