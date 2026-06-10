<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 架構準則（必讀）

新增或修改功能前，**務必先讀 [`ARCHITECTURE.md`](./ARCHITECTURE.md)**。所有程式碼一律遵循其中的分層（route → service → repository → db）與慣例。與該文件衝突的舊寫法視為待重構債務，不可作為新程式的範本。
