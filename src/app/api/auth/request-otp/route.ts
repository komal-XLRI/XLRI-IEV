import { type NextRequest } from 'next/server';
import { jsonResponse, withErrorHandling } from '@/lib/api/response';
import { requestOtpSchema } from '@/validators/auth';
import { requestOtp } from '@/services/auth/authService';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const input = requestOtpSchema.parse(body);

  const result = await requestOtp(input.email);
  return jsonResponse(result);
});
