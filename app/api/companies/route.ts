import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { CreateCompanySchema, UpdateCompanySchema } from '@/lib/schemas';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const medicineCompanies = await prisma.medicine.findMany({
      where: {
        shopId: auth.user.shopId,
        isActive: true,
        company: { not: '' },
      },
      select: { company: true },
      distinct: ['company'],
    });

    const existingCompanies = await prisma.company.findMany({
      where: { shopId: auth.user.shopId },
      orderBy: { name: 'asc' },
    });

    const existingNames = new Set(existingCompanies.map((company) => company.name));
    const missingCompanies = medicineCompanies
      .map((row) => row.company.trim())
      .filter((name) => name && !existingNames.has(name))
      .map((name) => ({
        shopId: auth.user!.shopId,
        name,
      }));

    if (missingCompanies.length > 0) {
      await prisma.company.createMany({
        data: missingCompanies,
      });
    }

    const companies = missingCompanies.length > 0
      ? await prisma.company.findMany({
          where: { shopId: auth.user.shopId },
          orderBy: { name: 'asc' },
        })
      : existingCompanies;

    return NextResponse.json({ success: true, data: companies });
  } catch (error) {
    console.error('Get companies error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load companies' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = CreateCompanySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid company data' },
        { status: 400 }
      );
    }

    const company = await prisma.company.create({
      data: {
        shopId: auth.user.shopId,
        name: validation.data.name.trim(),
        description: validation.data.description?.trim() || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: company,
      message: 'Company created successfully',
    });
  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create company' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validation = UpdateCompanySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: 'Invalid company data' },
        { status: 400 }
      );
    }

    const existing = await prisma.company.findFirst({
      where: {
        id: validation.data.id,
        shopId: auth.user.shopId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    const previousName = existing.name;
    const nextName = validation.data.name.trim();

    const company = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          description: validation.data.description?.trim() || null,
        },
      });

      if (previousName !== nextName) {
        await tx.medicine.updateMany({
          where: {
            shopId: auth.user!.shopId,
            company: previousName,
          },
          data: {
            company: nextName,
          },
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: company,
      message: 'Company updated successfully',
    });
  } catch (error) {
    console.error('Update company error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update company' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (!['ADMIN', 'MANAGER'].includes(auth.user.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Company id is required' },
        { status: 400 }
      );
    }

    const company = await prisma.company.findFirst({
      where: {
        id,
        shopId: auth.user.shopId,
      },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    const medicinesUsingCompany = await prisma.medicine.count({
      where: {
        shopId: auth.user.shopId,
        company: company.name,
        isActive: true,
      },
    });

    if (medicinesUsingCompany > 0) {
      return NextResponse.json(
        { success: false, message: 'Cannot delete a company that is used by medicines' },
        { status: 409 }
      );
    }

    await prisma.company.delete({
      where: { id: company.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Company deleted successfully',
    });
  } catch (error) {
    console.error('Delete company error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete company' },
      { status: 500 }
    );
  }
}
