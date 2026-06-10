import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";

// 取消批號確認
export async function POST(request: NextRequest) {
  const db = getDb();
  seedData(db);
  const body = await request.json();
  const { batchNo, suspenseDate, operator, userId } = body;

  if (!batchNo) {
    return NextResponse.json({ error: "批號必填" }, { status: 400 });
  }

  // 權限：經辦需該批所有帳號皆為其可維護範圍
  const accessible = getAccessibleAccountCodes(db, userId || 0, suspenseDate);
  if (accessible !== null) {
    const allowed = new Set(accessible);
    const accts = db.prepare("SELECT DISTINCT account_code FROM suspense_transactions WHERE batch_no = ?").all(batchNo) as Array<{ account_code: string }>;
    if (accts.some(a => !allowed.has(a.account_code))) {
      return NextResponse.json({ error: "此批號包含您無權維護的帳號，無法取消確認" }, { status: 403 });
    }
  }

  // 檢查是否已日結
  const dayClosed = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND is_day_closed = 1
  `).get(batchNo) as { cnt: number };

  if (dayClosed.cnt > 0) {
    return NextResponse.json({ error: "已日結，不得取消確認" }, { status: 400 });
  }

  // 檢查通報鎖定（日常暫收）
  const reportLocked = db.prepare(`
    SELECT COUNT(*) as cnt FROM suspense_transactions
    WHERE batch_no = ? AND suspense_type = 'DAILY' AND is_report_locked = 1
  `).get(batchNo) as { cnt: number };

  if (reportLocked.cnt > 0) {
    return NextResponse.json({ error: "已通報鎖定，不得取消日常暫收確認" }, { status: 400 });
  }

  const cancelAll = db.transaction(() => {
    // 更新交易確認狀態為未覆核
    db.prepare(`
      UPDATE suspense_transactions SET is_confirmed = 0, updated_by = ?, updated_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator || "System", batchNo);

    // 更新批號確認狀態
    db.prepare(`
      UPDATE batch_confirmations
      SET confirm_status = 'UNCONFIRMED', cancelled_by = ?, cancelled_at = datetime('now'), version = version + 1
      WHERE batch_no = ?
    `).run(operator || "System", batchNo);

    // 刪除傳票
    const voucherResult = db.prepare("DELETE FROM voucher_entries WHERE batch_no = ?").run(batchNo);

    // 刪除通報明細
    const reportResult = db.prepare("DELETE FROM report_details WHERE batch_no = ?").run(batchNo);

    return { vouchers: voucherResult.changes, reports: reportResult.changes };
  });

  const result = cancelAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 取消確認成功，刪除 ${result.vouchers} 筆傳票、${result.reports} 筆通報`,
    confirmed: false,
  });
}
