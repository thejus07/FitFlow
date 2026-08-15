import { z } from 'zod';
export const Role = z.enum(['ADMIN', 'MEMBER']); export type Role = z.infer<typeof Role>;
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export const registerSchema = loginSchema.extend({ name: z.string().min(2), organizationName: z.string().min(2).optional() });
export const createMemberSchema = loginSchema.extend({ name: z.string().min(2) });
export const forgotPasswordSchema = z.object({ email: z.string().email('Please enter a valid email address') });
export const resetPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  code: z.string().min(6, 'Reset code must be 6 digits'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});
export const attendanceTokenSchema = z.object({ attendance_token: z.string().uuid() });
export type Session = { token: string; user: { id: string; name: string; role: Role; organizationId: string } };
export type ApiError = { error: string; code?: string };
