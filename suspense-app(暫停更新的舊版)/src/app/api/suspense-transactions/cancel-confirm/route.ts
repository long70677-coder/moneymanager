import { NextRequest, NextResponse } from "next/server";
import { getDb, seedData, getAccessibleAccountCodes } from "@/lib/db";
import { suspenseRepo } from "@/repositories/suspense.repo";
import { batchRepo } from "@/repositories/batch.repo";
import { voucherRepo } from "@/repositories/voucher.repo";
import { reportRepo } from "@/repositories/report.repo";

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
    const accts = suspenseRepo.distinctAccountCodesByBatch(db, batchNo);
    if (accts.some(code => !allowed.has(code))) {
      return NextResponse.json({ error: "此批號包含您無權維護的帳號，無法取消確認" }, { status: 403 });
    }
  }

  // 檢查是否已日結
  if (suspenseRepo.countDayClosedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "已日結，不得取消確認" }, { status: 400 });
  }

  // 檢查通報鎖定（日常暫收）
  if (suspenseRepo.countDailyReportLockedByBatch(db, batchNo) > 0) {
    return NextResponse.json({ error: "已通報鎖定，不得取消日常暫收確認" }, { status: 400 });
  }

  const cancelAll = db.transaction(() => {
    // 交易與批號狀態改回未確認
    suspenseRepo.setConfirmedByBatch(db, batchNo, operator || "System", false);
    batchRepo.markCancelled(db, batchNo, operator || "System");

    // 刪除傳票與通報明細
    const vouchers = voucherRepo.deleteByBatch(db, batchNo);
    const reports = reportRepo.deleteByBatch(db, batchNo);

    return { vouchers, reports };
  });

  const result = cancelAll();

  return NextResponse.json({
    message: `批號 ${batchNo} 取消確認成功，刪除 ${result.vouchers} 筆傳票、${result.reports} 筆通報`,
    confirmed: false,
  });
}
