/**
 * Dev-only bootstrap: set user with SUPER_ADMIN_EMAIL to role super_admin.
 * Runs only when NODE_ENV !== 'production'. Never runs in production.
 * Use for local/staging testing (store creation, publish without email verification).
 *
 * Security: In production this function is a no-op. PROD_OVERRIDE does not
 * enable bootstrap—it only affects super_admin bypass of email verification.
 */

export async function bootstrapSuperAdmin(prisma) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const email = process.env.SUPER_ADMIN_EMAIL?.trim();
  if (!email) {
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      console.log('[Bootstrap] SUPER_ADMIN_EMAIL set but user not found:', email);
      return;
    }
    if (user.role === 'super_admin') {
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'super_admin',
        roles: JSON.stringify(['super_admin']),
      },
    });
    console.log('[Bootstrap] Super admin set:', user.email);
  } catch (err) {
    console.warn('[Bootstrap] Super admin bootstrap failed (non-fatal):', err?.message);
  }
}
