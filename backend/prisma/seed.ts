import { PrismaClient, TemplateScope } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SYSTEM_TEMPLATES = [
  {
    name: 'Classic NDIS',
    description: 'Clean, professional NDIS-compliant invoice layout',
    scope: TemplateScope.SYSTEM,
    brandColor: '#2c5f2e',
    isDefault: true,
    htmlContent: getClassicTemplate(),
  },
  {
    name: 'Modern Minimal',
    description: 'Sleek minimal layout with bold typography',
    scope: TemplateScope.SYSTEM,
    brandColor: '#1a1814',
    isDefault: false,
    htmlContent: getModernTemplate(),
  },
  {
    name: 'Professional Blue',
    description: 'Corporate blue theme, great for organisations',
    scope: TemplateScope.SYSTEM,
    brandColor: '#1a56db',
    isDefault: false,
    htmlContent: getProfessionalTemplate(),
  },
];

async function main() {
  console.log('🌱 Seeding database...');

  // System templates
  for (const tmpl of SYSTEM_TEMPLATES) {
    await prisma.template.upsert({
      where: { id: `system-${tmpl.name.toLowerCase().replace(/\s/g, '-')}` },
      update: tmpl,
      create: { id: `system-${tmpl.name.toLowerCase().replace(/\s/g, '-')}`, ...tmpl },
    });
  }
  console.log('✅ System templates seeded');

  // Demo admin user
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@invoiceflow.app' },
    update: {},
    create: {
      email: 'admin@invoiceflow.app',
      name: 'InvoiceFlow Admin',
      passwordHash: adminHash,
      emailVerified: true,
      role: 'ADMIN',
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      bizName: 'InvoiceFlow Demo',
      email: 'admin@invoiceflow.app',
    },
  });

  await prisma.subscription.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      plan: 'PRO_MONTHLY',
      status: 'ACTIVE',
    },
  });

  await prisma.usageTracking.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: { workspaceId: workspace.id },
  });

  console.log('✅ Admin user seeded');
  console.log('🎉 Seed complete');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

function getClassicTemplate(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: '{{fontFamily}}', 'DM Sans', sans-serif; color: #1a1814; font-size: 13px; line-height: 1.5; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid {{brandColor}}; }
  .brand { font-size: 28px; font-weight: 700; color: {{brandColor}}; }
  .invoice-meta { text-align: right; }
  .invoice-number { font-size: 20px; font-weight: 600; }
  .badge { display: inline-block; padding: 3px 10px; background: {{brandColor}}20; color: {{brandColor}}; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .party-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #7a756e; margin-bottom: 6px; }
  .party-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .party-detail { font-size: 12px; color: #7a756e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #7a756e; padding: 10px 8px; text-align: left; border-bottom: 1px solid #e8e5e0; background: #f9f8f6; }
  td { padding: 10px 8px; border-bottom: 1px solid #f0ece6; font-size: 12px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 32px; }
  .totals-box { width: 240px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; color: #7a756e; }
  .total-final { font-size: 16px; font-weight: 700; color: #1a1814; border-top: 2px solid #1a1814; padding-top: 10px; margin-top: 4px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e8e5e0; }
  .sig-box { }
  .sig-line { height: 60px; border-bottom: 1px solid #aaa; margin-bottom: 4px; display: flex; align-items: flex-end; }
  .sig-img { max-height: 55px; max-width: 180px; }
  .sig-label { font-size: 10px; color: #7a756e; }
  .footer { margin-top: 32px; font-size: 10px; color: #aaa; text-align: center; }
  .gst-note { font-size: 10px; color: #7a756e; margin-top: 6px; }
</style>
</head>
<body>
<div class="header">
  <div>
    {{#if logoUrl}}<img src="{{logoUrl}}" style="max-height:60px;margin-bottom:8px;display:block;">{{/if}}
    <div class="brand">{{bizName}}</div>
    {{#if providerABN}}<div style="font-size:11px;color:#7a756e;margin-top:2px;">ABN: {{providerABN}}</div>{{/if}}
    {{#if providerAddress}}<div style="font-size:11px;color:#7a756e;">{{providerAddress}}</div>{{/if}}
  </div>
  <div class="invoice-meta">
    <div class="invoice-number">{{invoiceTypeLabel}} #{{number}}</div>
    <div style="font-size:12px;color:#7a756e;margin:4px 0;">Date: {{issueDate}}</div>
    {{#if serviceMonth}}<div style="font-size:12px;color:#7a756e;">Period: {{serviceMonth}}</div>{{/if}}
    <div style="margin-top:8px"><span class="badge">{{status}}</span></div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="party-label">{{providerLabel}}</div>
    <div class="party-name">{{providerName}}</div>
    {{#if providerTitle}}<div class="party-detail">{{providerTitle}}</div>{{/if}}
    {{#if providerEmail}}<div class="party-detail">{{providerEmail}}</div>{{/if}}
    {{#if providerPhone}}<div class="party-detail">{{providerPhone}}</div>{{/if}}
  </div>
  <div>
    <div class="party-label">{{clientLabel}}</div>
    <div class="party-name">{{clientName}}</div>
    {{#if ndisNumber}}<div class="party-detail">NDIS #: {{ndisNumber}}</div>{{/if}}
    {{#if clientAddress}}<div class="party-detail">{{clientAddress}}</div>{{/if}}
    {{#if fiscalAgent}}<div class="party-detail">Plan Manager: {{fiscalAgent}}</div>{{/if}}
    {{#if supportCoordinator}}<div class="party-detail">Support Coordinator: {{supportCoordinator}}</div>{{/if}}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Start</th>
      <th>End</th>
      <th>Description</th>
      <th style="text-align:center">Hours</th>
      <th style="text-align:right">Rate</th>
      <th style="text-align:right">Amount</th>
    </tr>
  </thead>
  <tbody>
    {{#each lineItems}}
    <tr>
      <td>{{this.serviceDate}}</td>
      <td>{{this.startTime}}</td>
      <td>{{this.endTime}}</td>
      <td>{{this.description}}</td>
      <td style="text-align:center">{{this.hours}}</td>
      <td style="text-align:right">{{this.rate}}</td>
      <td style="text-align:right">{{this.amount}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="total-row"><span>Total Hours</span><span>{{totalHours}}</span></div>
    <div class="total-row"><span>Subtotal</span><span>{{subtotal}}</span></div>
    <div class="total-row"><span>GST</span><span>GST Free (NDIS)</span></div>
    <div class="total-row total-final"><span>TOTAL DUE ({{currency}})</span><span>{{totalAmount}}</span></div>
    <div class="gst-note">* NDIS support services are GST-free under Div 38-D of the GST Act.</div>
  </div>
</div>

{{#if notes}}
<div style="padding:16px;background:#f9f8f6;border-radius:8px;font-size:12px;margin-bottom:24px;">
  <strong>Notes:</strong> {{notes}}
</div>
{{/if}}

<div class="signatures">
  <div class="sig-box">
    <div class="sig-line">
      {{#if clientSigUrl}}<img class="sig-img" src="{{clientSigUrl}}">{{/if}}
    </div>
    <div class="sig-label">Participant Signature & Date</div>
  </div>
  <div class="sig-box">
    <div class="sig-line">
      {{#if providerSigUrl}}<img class="sig-img" src="{{providerSigUrl}}">{{/if}}
    </div>
    <div class="sig-label">Provider Signature & Date</div>
  </div>
</div>

<div class="footer">Generated by InvoiceFlow &mdash; NDIS Invoice Management</div>
</body>
</html>`;
}

function getModernTemplate(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; color: #0f0f0f; font-size: 13px; line-height: 1.6; padding: 48px; background: #fff; }
  .top { display: flex; justify-content: space-between; margin-bottom: 48px; }
  .brand-text { font-size: 32px; font-weight: 800; letter-spacing: -0.04em; color: {{brandColor}}; }
  .inv-label { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #999; }
  .inv-number { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .divider { height: 2px; background: #0f0f0f; margin: 0 0 32px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-bottom: 40px; }
  .p-label { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #999; margin-bottom: 8px; }
  .p-name { font-size: 14px; font-weight: 600; }
  .p-detail { font-size: 12px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #999; padding: 8px 0; border-bottom: 1px solid #eee; }
  td { padding: 12px 0; border-bottom: 1px solid #f5f5f5; font-size: 12px; }
  .total-section { margin-top: 32px; display: flex; justify-content: flex-end; }
  .total-table { width: 200px; }
  .tr { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #777; }
  .tr.big { font-size: 18px; font-weight: 800; color: #0f0f0f; padding-top: 12px; border-top: 2px solid #0f0f0f; margin-top: 8px; }
</style>
</head>
<body>
<div class="top">
  <div>
    {{#if logoUrl}}<img src="{{logoUrl}}" style="max-height:48px;margin-bottom:12px;display:block;">{{/if}}
    <div class="brand-text">{{bizName}}</div>
  </div>
  <div style="text-align:right">
    <div class="inv-label">{{invoiceTypeLabel}}</div>
    <div class="inv-number">#{{number}}</div>
    <div style="font-size:12px;color:#777;margin-top:4px;">{{issueDate}}</div>
  </div>
</div>
<div class="divider"></div>
<div class="parties">
  <div>
    <div class="p-label">From</div>
    <div class="p-name">{{providerName}}</div>
    {{#if providerTitle}}<div class="p-detail">{{providerTitle}}</div>{{/if}}
    {{#if providerABN}}<div class="p-detail">ABN {{providerABN}}</div>{{/if}}
    {{#if providerEmail}}<div class="p-detail">{{providerEmail}}</div>{{/if}}
  </div>
  <div>
    <div class="p-label">To</div>
    <div class="p-name">{{clientName}}</div>
    {{#if ndisNumber}}<div class="p-detail">NDIS #{{ndisNumber}}</div>{{/if}}
    {{#if clientAddress}}<div class="p-detail">{{clientAddress}}</div>{{/if}}
  </div>
  <div>
    <div class="p-label">Details</div>
    {{#if serviceMonth}}<div class="p-detail">Period: {{serviceMonth}}</div>{{/if}}
    <div class="p-detail">Currency: {{currency}}</div>
    {{#if fiscalAgent}}<div class="p-detail">Plan Mgr: {{fiscalAgent}}</div>{{/if}}
  </div>
</div>
<table>
  <thead><tr>
    <th>Description</th><th>Date</th><th style="text-align:center">Hrs</th>
    <th style="text-align:right">Rate</th><th style="text-align:right">Amount</th>
  </tr></thead>
  <tbody>
    {{#each lineItems}}
    <tr>
      <td>{{this.description}}</td>
      <td>{{this.serviceDate}} {{this.startTime}}–{{this.endTime}}</td>
      <td style="text-align:center">{{this.hours}}</td>
      <td style="text-align:right">{{this.rate}}</td>
      <td style="text-align:right"><strong>{{this.amount}}</strong></td>
    </tr>
    {{/each}}
  </tbody>
</table>
<div class="total-section">
  <div class="total-table">
    <div class="tr"><span>Hours</span><span>{{totalHours}}</span></div>
    <div class="tr"><span>GST</span><span>Nil (NDIS)</span></div>
    <div class="tr big"><span>Total</span><span>{{totalAmount}}</span></div>
  </div>
</div>
</body>
</html>`;
}

function getProfessionalTemplate(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 13px; line-height: 1.5; }
  .header-bar { background: {{brandColor}}; color: white; padding: 24px 40px; display: flex; justify-content: space-between; align-items: center; }
  .header-title { font-size: 22px; font-weight: 700; }
  .header-inv { text-align: right; font-size: 13px; }
  .body { padding: 32px 40px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 28px; background: #f5f7ff; border-radius: 8px; padding: 20px; }
  .p-h { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: {{brandColor}}; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: {{brandColor}}; color: white; }
  th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  td { padding: 10px 12px; border-bottom: 1px solid #eef; font-size: 12px; }
  tr:nth-child(even) td { background: #f9f9ff; }
  .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
  .tbox { background: #f5f7ff; border-radius: 8px; padding: 16px; width: 220px; }
  .trow { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #555; }
  .trow.grand { font-size: 15px; font-weight: 700; color: {{brandColor}}; border-top: 2px solid {{brandColor}}; padding-top: 10px; margin-top: 6px; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
  .sig-line { height: 50px; border-bottom: 1px solid #aaa; margin-bottom: 4px; display: flex; align-items: flex-end; }
  .sig-lbl { font-size: 10px; color: #888; }
</style>
</head>
<body>
<div class="header-bar">
  <div>
    {{#if logoUrl}}<img src="{{logoUrl}}" style="max-height:48px;filter:brightness(0) invert(1);margin-bottom:8px;display:block;">{{/if}}
    <div class="header-title">{{bizName}}</div>
    {{#if providerABN}}<div style="font-size:11px;opacity:0.8;margin-top:2px;">ABN: {{providerABN}}</div>{{/if}}
  </div>
  <div class="header-inv">
    <div style="font-size:18px;font-weight:700;">{{invoiceTypeLabel}} #{{number}}</div>
    <div style="opacity:0.85;margin-top:4px;">Date: {{issueDate}}</div>
    {{#if serviceMonth}}<div style="opacity:0.85;">Period: {{serviceMonth}}</div>{{/if}}
  </div>
</div>
<div class="body">
  <div class="parties">
    <div><div class="p-h">{{providerLabel}}</div>
      <strong>{{providerName}}</strong><br>
      {{#if providerTitle}}<span style="color:#555">{{providerTitle}}</span><br>{{/if}}
      {{#if providerAddress}}<span style="color:#555">{{providerAddress}}</span><br>{{/if}}
      {{#if providerEmail}}<span style="color:#555">{{providerEmail}}</span>{{/if}}
    </div>
    <div><div class="p-h">{{clientLabel}}</div>
      <strong>{{clientName}}</strong><br>
      {{#if ndisNumber}}<span style="color:#555">NDIS #: {{ndisNumber}}</span><br>{{/if}}
      {{#if clientAddress}}<span style="color:#555">{{clientAddress}}</span><br>{{/if}}
      {{#if fiscalAgent}}<span style="color:#555">Plan Manager: {{fiscalAgent}}</span>{{/if}}
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Date</th><th>Time</th><th>Description</th>
      <th style="text-align:center">Hrs</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th>
    </tr></thead>
    <tbody>
      {{#each lineItems}}
      <tr>
        <td>{{this.serviceDate}}</td>
        <td>{{this.startTime}}–{{this.endTime}}</td>
        <td>{{this.description}}</td>
        <td style="text-align:center">{{this.hours}}</td>
        <td style="text-align:right">{{this.rate}}</td>
        <td style="text-align:right"><strong>{{this.amount}}</strong></td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <div class="totals">
    <div class="tbox">
      <div class="trow"><span>Total Hours</span><span>{{totalHours}}</span></div>
      <div class="trow"><span>GST (NDIS Exempt)</span><span>$0.00</span></div>
      <div class="trow grand"><span>TOTAL {{currency}}</span><span>{{totalAmount}}</span></div>
    </div>
  </div>
  <div class="sigs">
    <div><div class="sig-line">{{#if clientSigUrl}}<img src="{{clientSigUrl}}" style="max-height:45px;">{{/if}}</div><div class="sig-lbl">Participant Signature</div></div>
    <div><div class="sig-line">{{#if providerSigUrl}}<img src="{{providerSigUrl}}" style="max-height:45px;">{{/if}}</div><div class="sig-lbl">Provider Signature</div></div>
  </div>
</div>
</body>
</html>`;
}
