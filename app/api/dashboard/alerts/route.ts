import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req)
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }
    const shopId = auth.user.shopId;

    // Fetch global inventory settings for thresholds
    const shopSettings = await prisma.shopSettings.findUnique({ where: { shopId } });
    const nearExpiryDays = shopSettings?.nearExpiryDays ?? 30;
    const globalLowStock = shopSettings?.lowStockThreshold ?? 5;

    const expiryAlerts = await prisma.inventoryBatch.findMany({
      where: {
        shopId,
        expiryDate: {
          lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * nearExpiryDays),
          gt: new Date(),
        },
      },
      include: {
        medicine: true,
      },
      orderBy: {
        expiryDate: "asc",
      },
    })

    const allActiveBatches = await prisma.inventoryBatch.findMany({
      where: { shopId, expiryDate: { gt: new Date() }, deletedAt: null },
      include: {
        medicine: {
          select: { id: true, name: true, lowStockThreshold: true },
        },
      },
    })

    const lowStock = allActiveBatches
      .filter((batch) => batch.stockQty <= (batch.medicine.lowStockThreshold || globalLowStock))
      .sort((a, b) => a.stockQty - b.stockQty)

    // Optional: compute aggregated medicine stock from active batches if still needed
    const medicineStockMap = new Map<string, { id: string; name: string; threshold: number; currentStock: number }>()
    for (const batch of allActiveBatches) {
      if (!medicineStockMap.has(batch.medicine.id)) {
        medicineStockMap.set(batch.medicine.id, {
          id: batch.medicine.id,
          name: batch.medicine.name,
          threshold: batch.medicine.lowStockThreshold || globalLowStock,
          currentStock: 0,
        })
      }
      medicineStockMap.get(batch.medicine.id)!.currentStock += batch.stockQty
    }

    const lowStockMedicines = Array.from(medicineStockMap.values())
      .filter((med) => med.currentStock <= med.threshold)
      .sort((a, b) => a.currentStock - b.currentStock)

    const [negativeStockBatches, expiredBatches, missingBatchNumbers] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: {
          shopId,
          stockQty: { lt: 0 },
        },
        include: {
          medicine: { select: { name: true } },
        },
        orderBy: { stockQty: "asc" },
        take: 20,
      }),
      prisma.inventoryBatch.findMany({
        where: {
          shopId,
          expiryDate: { lte: new Date() },
        },
        include: {
          medicine: { select: { name: true } },
        },
        orderBy: { expiryDate: "asc" },
        take: 20,
      }),
      prisma.inventoryBatch.findMany({
        where: {
          shopId,
          batchNumber: "",
        },
        include: {
          medicine: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ])

    return NextResponse.json({
      success: true,
      expiryAlerts,
      lowStock,
      lowStockMedicines,
      healthAlerts: {
        negativeStockBatches,
        expiredBatches,
        missingBatchNumbers,
      },
    })
  } catch (error) {
    console.error("Error fetching alerts:", error)
    return NextResponse.json(
      { success: false, message: "Failed to fetch alerts" },
      { status: 500 }
    )
  }
}
