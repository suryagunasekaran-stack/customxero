import { NextRequest, NextResponse } from 'next/server';
import { ensureValidToken } from '@/lib/ensureXeroToken';
import { trackXeroApiCall, waitForXeroRateLimit, updateXeroRateLimitFromHeaders } from '@/lib/xeroApiTracker';
import { auth } from '@/lib/auth';

interface XeroProject {
  projectId: string;
  contactId: string;
  name: string;
  currencyCode: string;
  minutesLogged: number;
  totalTaskAmount: {
    currency: string;
    value: number;
  };
  totalExpenseAmount: {
    currency: string;
    value: number;
  };
  minutesToBeInvoiced: number;
  taskAmountToBeInvoiced: {
    currency: string;
    value: number;
  };
  taskAmountInvoiced: {
    currency: string;
    value: number;
  };
  expenseAmountToBeInvoiced: {
    currency: string;
    value: number;
  };
  expenseAmountInvoiced: {
    currency: string;
    value: number;
  };
  projectAmountInvoiced: {
    currency: string;
    value: number;
  };
  deposit: {
    currency: string;
    value: number;
  };
  depositApplied: {
    currency: string;
    value: number;
  };
  creditNoteAmount: {
    currency: string;
    value: number;
  };
  deadlineUtc?: string;
  totalInvoiced: {
    currency: string;
    value: number;
  };
  totalToBeInvoiced: {
    currency: string;
    value: number;
  };
  estimate?: {
    currency: string;
    value: number;
  };
  status: string;
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const states = searchParams.get('states') || 'INPROGRESS';
    
    // Ensure valid Xero token
    const { access_token, effective_tenant_id } = await ensureValidToken();
    if (!access_token) {
      return NextResponse.json({ error: 'Failed to obtain Xero token' }, { status: 500 });
    }

    // Get selected tenant
    const selectedTenant = effective_tenant_id;
    if (!selectedTenant) {
      return NextResponse.json({ error: 'No Xero tenant selected' }, { status: 400 });
    }

    // Check rate limiting
    await waitForXeroRateLimit(selectedTenant);

    // Track API call
    await trackXeroApiCall(selectedTenant);

    // Fetch projects from Xero
    const xeroResponse = await fetch(`https://api.xero.com/projects.xro/2.0/Projects?states=${states}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Xero-tenant-id': selectedTenant,
        'Accept': 'application/json',
      },
    });

    // Update rate limit from headers
    await updateXeroRateLimitFromHeaders(xeroResponse.headers, selectedTenant);

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('Xero API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to fetch projects from Xero', details: errorText },
        { status: xeroResponse.status }
      );
    }

    const data = await xeroResponse.json();
    const projects = data.items || [];

    // Format response
    const formattedResponse = {
      projects: projects.map((project: XeroProject) => ({
        projectId: project.projectId,
        name: project.name,
        status: project.status,
        contactId: project.contactId,
        currencyCode: project.currencyCode,
        totalInvoiced: project.totalInvoiced?.value || 0,
        totalToBeInvoiced: project.totalToBeInvoiced?.value || 0,
        projectAmountInvoiced: project.projectAmountInvoiced?.value || 0,
        deadlineUtc: project.deadlineUtc,
        estimate: project.estimate?.value || 0,
      })),
      metadata: {
        count: projects.length,
        states: states,
        timestamp: new Date().toISOString(),
      },
    };

    return NextResponse.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching Xero projects:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}