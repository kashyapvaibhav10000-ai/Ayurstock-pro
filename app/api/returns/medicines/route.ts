import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch distinct medicines that currently exist in inventory batches with stock > 0
    const activeBatches = await prisma.inventoryBatch.findMany({
      where: {
        shopId: auth.user.shopId,
        stockQty: { gt: 0 },
        deletedAt: null,
      },
      include: {
        medicine: true,
      },
      orderBy: {
        medicine: {
          name: "asc",
        },
      },
    });

    // Deduplicate array of medicines
    const medicineMap = new Map();
    for (const batch of activeBatches) {
      if (!medicineMap.has(batch.medicineId)) {
        medicineMap.set(batch.medicineId, batch.medicine);
      }
    }

    return NextResponse.json({
      success: true,
      data: Array.from(medicineMap.values()),
    });
  } catch (error) {
    console.error("Error fetching medicines for returns:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch medicines" },
      { status: 500 }
    );
  }
}
