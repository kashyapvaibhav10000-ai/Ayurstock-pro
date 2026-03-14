import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyAuth } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req)
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    const expiryAlerts = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        expiryDate: {
          lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
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

    const lowStock = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        stockQty: {
          lte: 5,
        },
        expiryDate: {
          gt: new Date(),
        },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            lowStockThreshold: true,
          },
        },
      },
      orderBy: {
        stockQty: "asc",
      },
    })

    const lowStockByMedicine = await prisma.medicine.findMany({
      where: {
        shopId: auth.user.shopId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        lowStockThreshold: true,
        batches: {
          select: { stockQty: true },
        },
      },
    })

    const lowStockMedicines = lowStockByMedicine
      .map((medicine) => {
        const totalStock = medicine.batches.reduce((sum, batch) => sum + batch.stockQty, 0)
        return {
          id: medicine.id,
          name: medicine.name,
          currentStock: totalStock,
          threshold: medicine.lowStockThreshold,
        }
      })
      .filter((medicine) => medicine.currentStock <= medicine.threshold)
      .sort((a, b) => a.currentStock - b.currentStock)

    const [negativeStockBatches, expiredBatches, missingBatchNumbers] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where: {
          shopId: auth.user.shopId,
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
          shopId: auth.user.shopId,
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
          shopId: auth.user.shopId,
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
