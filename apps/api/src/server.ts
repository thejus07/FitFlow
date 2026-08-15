import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config();
import Fastify from 'fastify'; import cors from '@fastify/cors'; import jwt from '@fastify/jwt'; import bcrypt from 'bcryptjs'; import { PrismaClient, Role, MembershipStatus } from '@prisma/client'; import { attendanceTokenSchema, createMemberSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '@pulse/shared';

let _db: PrismaClient | null = null;
const getDb = () => { if (!_db) { _db = new PrismaClient(); } return _db; };

const app = Fastify({ logger: true });
const secret = process.env.JWT_SECRET || 'fitflow_default_jwt_secret_key_2026';
app.register(cors, { origin: process.env.WEB_ORIGIN?.split(',') ?? true });
app.register(jwt, { secret });

type Claims = { id: string; role: Role; organizationId: string };
const auth = async (req: any, reply: any) => { try { await req.jwtVerify(); } catch { reply.code(401).send({ error: 'Unauthorized' }); } };
const admin = async (req: any, reply: any) => { await auth(req, reply); if (reply.sent) return; if ((req.user as Claims).role !== Role.ADMIN) reply.code(403).send({ error: 'Admin access required' }); };
const orgFilter = (req: any) => ({ organizationId: (req.user as Claims).organizationId });
const session = (user: { id: string; name: string; role: Role; organizationId: string }) => ({ token: app.jwt.sign({ id: user.id, role: user.role, organizationId: user.organizationId }), user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });

app.get('/', async () => ({ status: 'ok', service: 'FitFlow API' }));
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

app.post('/auth/organization/register', async (req, reply) => {
  const input = registerSchema.parse(req.body);
  if (!input.organizationName) return reply.code(400).send({ error: 'organizationName is required' });
  if (await getDb().user.findUnique({ where: { email: input.email } })) return reply.code(409).send({ error: 'Email already registered' });
  const organization = await getDb().organization.create({ data: { name: input.organizationName } });
  const user = await getDb().user.create({ data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12), role: Role.ADMIN, organizationId: organization.id } });
  return session(user);
});

const loginForRole = (role: Role, portal: string) => async (req: any, reply: any) => {
  const input = loginSchema.parse(req.body);
  const user = await getDb().user.findUnique({ where: { email: input.email } });
  if (!user || !await bcrypt.compare(input.password, user.passwordHash)) return reply.code(401).send({ error: 'Invalid email or password' });
  if (user.role !== role) return reply.code(403).send({ error: `This account is not registered for the ${portal} portal. Please use the correct login.` });
  return session(user);
};

app.post('/auth/member/register', async (req, reply) => {
  const input = registerSchema.parse(req.body);
  if (!input.organizationName) return reply.code(400).send({ error: 'Gym or organization name is required' });
  const organization = await getDb().organization.findFirst({ where: { name: input.organizationName } });
  if (!organization) return reply.code(404).send({ error: 'Gym organization not found. Check the name with your gym.' });
  if (await getDb().user.findUnique({ where: { email: input.email } })) return reply.code(409).send({ error: 'Email already registered' });
  const user = await getDb().user.create({ data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12), role: Role.MEMBER, organizationId: organization.id } });
  await getDb().member.create({ data: { userId: user.id, organizationId: organization.id } });
  return session(user);
});

app.post('/auth/organization/login', loginForRole(Role.ADMIN, 'organization'));
app.post('/auth/member/login', loginForRole(Role.MEMBER, 'member'));
app.post('/auth/logout', { preHandler: auth }, async () => ({ ok: true }));

app.post('/auth/forgot-password', async (req, reply) => {
  const input = forgotPasswordSchema.parse(req.body);
  const user = await getDb().user.findUnique({ where: { email: input.email } });
  if (!user) return reply.code(404).send({ error: 'No account found with this email address.' });
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await getDb().passwordResetToken.create({ data: { email: input.email, code, expiresAt } });

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'FitFlow <onboarding@resend.dev>',
          to: [input.email],
          subject: 'Your FitFlow Password Reset Code',
          html: `<div style="font-family:sans-serif;padding:20px;"><h2>FitFlow Password Reset</h2><p>Your 6-digit password reset code is:</p><h1 style="letter-spacing:4px;color:#526f00;">${code}</h1><p>This code expires in 15 minutes.</p></div>`
        })
      });
    } catch (e) {
      console.error('Failed to send email:', e);
    }
  }

  return { message: 'Password reset code sent successfully.' };
});

app.post('/auth/reset-password', async (req, reply) => {
  const input = resetPasswordSchema.parse(req.body);
  const resetToken = await getDb().passwordResetToken.findFirst({ where: { email: input.email, code: input.code, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!resetToken) return reply.code(400).send({ error: 'Invalid or expired password reset code.' });
  const user = await getDb().user.findUnique({ where: { email: input.email } });
  if (!user) return reply.code(404).send({ error: 'User account not found.' });
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await getDb().$transaction([getDb().user.update({ where: { email: input.email }, data: { passwordHash } }), getDb().passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } })]);
  return { message: 'Password reset successfully. You can now sign in with your new password.' };
});

app.post('/members', { preHandler: admin }, async (req: any, reply) => {
  const input = createMemberSchema.parse(req.body);
  if (await getDb().user.findUnique({ where: { email: input.email } })) return reply.code(409).send({ error: 'Email already registered' });
  const user = await getDb().user.create({ data: { email: input.email, name: input.name, passwordHash: await bcrypt.hash(input.password, 12), role: Role.MEMBER, organizationId: req.user.organizationId } });
  const member = await getDb().member.create({ data: { userId: user.id, organizationId: req.user.organizationId } });
  return reply.code(201).send({ id: member.id, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/dashboard', { preHandler: admin }, async (req: any) => {
  const f = orgFilter(req);
  const [members, active, expired, pending, attendance] = await Promise.all([
    getDb().member.count({ where: f }),
    getDb().membership.count({ where: { member: { ...f }, status: MembershipStatus.ACTIVE } }),
    getDb().membership.count({ where: { member: { ...f }, status: MembershipStatus.EXPIRED } }),
    getDb().payment.aggregate({ where: { member: { ...f }, status: 'DUE' }, _sum: { amount: true } }),
    getDb().attendance.count({ where: { member: { ...f }, checkedInAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } })
  ]);
  return { members, active, expired, pending: pending._sum.amount || 0, attendance, revenue: 0 };
});

app.get('/members', { preHandler: admin }, async (req: any) => getDb().member.findMany({ where: orgFilter(req), include: { user: true, membership: true, payments: true }, orderBy: { user: { name: 'asc' } } }));
app.get('/members/:id', { preHandler: auth }, async (req: any, reply) => {
  const m = await getDb().member.findFirst({ where: { id: req.params.id, ...orgFilter(req) }, include: { user: true, membership: true, attendance: true, payments: true, workouts: true, diets: true } });
  return m ?? reply.code(404).send({ error: 'Member not found' });
});

app.get('/me', { preHandler: auth }, async (req: any) => {
  const c = req.user as Claims;
  const user = await getDb().user.findUniqueOrThrow({ where: { id: c.id } });
  if (c.role === 'ADMIN') return { user };
  const member = await getDb().member.findUniqueOrThrow({ where: { userId: c.id }, include: { membership: true, workouts: { take: 1, orderBy: { assignedFor: 'desc' } }, diets: { take: 1 }, payments: true } });
  return { user, member };
});

app.get('/workouts', { preHandler: auth }, async (req: any) => getDb().workoutAssignment.findMany({ where: { member: { ...orgFilter(req), ...(req.user.role === 'MEMBER' ? { userId: req.user.id } : {}) } } }));
app.get('/diet-plans', { preHandler: auth }, async (req: any) => getDb().dietPlan.findMany({ where: { member: { ...orgFilter(req), ...(req.user.role === 'MEMBER' ? { userId: req.user.id } : {}) } } }));
app.get('/payments', { preHandler: auth }, async (req: any) => getDb().payment.findMany({ where: { member: { ...orgFilter(req), ...(req.user.role === 'MEMBER' ? { userId: req.user.id } : {}) } } }));

app.get('/attendance/history', { preHandler: auth }, async (req: any) => getDb().attendance.findMany({ where: { member: { ...orgFilter(req), ...(req.user.role === 'MEMBER' ? { userId: req.user.id } : {}) } }, orderBy: { checkedInAt: 'desc' }, take: 100 }));
app.get('/attendance', { preHandler: admin }, async (req: any) => getDb().attendance.findMany({ where: { member: orgFilter(req) }, include: { member: { include: { user: true } } }, orderBy: { checkedInAt: 'desc' }, take: 100 }));

app.get('/attendance/token', { preHandler: auth }, async (req: any, reply) => {
  if (req.user.role !== 'MEMBER') return reply.code(403).send({ error: 'Members only' });
  const member = await getDb().member.findUniqueOrThrow({ where: { userId: req.user.id }, include: { qrToken: true } });
  const token = member.qrToken && member.qrToken.expiresAt > new Date() ? member.qrToken : await getDb().qrToken.upsert({ where: { memberId: member.id }, update: { token: crypto.randomUUID(), expiresAt: new Date(Date.now() + 300000), usedAt: null }, create: { memberId: member.id, expiresAt: new Date(Date.now() + 300000) } });
  return { attendance_token: token.token, expiresAt: token.expiresAt };
});

app.post('/attendance/check-in', { preHandler: admin }, async (req: any, reply) => {
  const { attendance_token } = attendanceTokenSchema.parse(req.body);
  const token = await getDb().qrToken.findUnique({ where: { token: attendance_token }, include: { member: { include: { user: true, membership: true } } } });
  if (!token || token.expiresAt < new Date()) return reply.code(400).send({ error: 'This QR code is invalid or expired', code: 'INVALID_TOKEN' });
  if (!token.member.membership || token.member.membership.status !== 'ACTIVE' || token.member.membership.expiryDate < new Date()) return reply.code(400).send({ error: 'Attendance cannot be recorded because membership has expired.', code: 'MEMBERSHIP_EXPIRED' });
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (await getDb().attendance.findFirst({ where: { memberId: token.memberId, checkedInAt: { gte: start } } })) return reply.code(409).send({ error: 'Attendance already recorded today', code: 'DUPLICATE' });
  const attendance = await getDb().$transaction(async (tx: any) => {
    await tx.qrToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return tx.attendance.create({ data: { memberId: token.memberId } });
  });
  return { attendance, member: { name: token.member.user.name } };
});

app.get('/notifications', { preHandler: auth }, async (req: any) => getDb().notification.findMany({ where: { organizationId: req.user.organizationId, OR: [{ audience: req.user.role }, { userId: req.user.id }, { audience: null }] }, orderBy: { createdAt: 'desc' } }));
app.post('/notifications/:id/read', { preHandler: auth }, async (req: any) => getDb().notification.update({ where: { id: req.params.id }, data: { readAt: new Date() } }));

app.setErrorHandler((e, _req, reply) => reply.code((e as any).statusCode || 400).send({ error: (e as Error).message || 'Request failed' }));

if (!process.env.VERCEL) { await app.listen({ port: Number(process.env.PORT || 4000), host: '0.0.0.0' }); }
export { app };
