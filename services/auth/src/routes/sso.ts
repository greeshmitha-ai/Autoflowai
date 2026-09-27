import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { users, tenants } from '@platform/db';
import type { AuthConfig } from '../config.js';
import { issueTokens } from '../token.js';
import { RefreshTokenStore } from '../refresh-store.js';

/**
 * SAML 2.0 Assertion Consumer Service endpoint.
 * Validates the SAML response and issues platform tokens.
 */
export function ssoRoutes(
  app: FastifyInstance,
  config: AuthConfig,
  refreshStore: RefreshTokenStore,
): void {
  // SAML 2.0 Assertion Consumer Service
  app.post(
    '/auth/sso/saml',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // The SAML response is typically form-encoded
      const body = request.body as Record<string, string> | undefined;
      const samlResponse = body?.['SAMLResponse'];
      const relayState = body?.['RelayState'];

      if (!samlResponse) {
        return reply.status(400).send({ error: 'Missing SAMLResponse' });
      }

      // Decode and parse the SAML assertion
      // In production, use a library like samlify or passport-saml to validate
      // the signature, issuer, audience, and NotOnOrAfter conditions.
      // Here we implement the integration point with a structured placeholder
      // that can be wired to a real SAML IdP configuration per tenant.
      let assertionData: SamlAssertionData;
      try {
        assertionData = parseSamlAssertion(samlResponse);
      } catch (err) {
        request.log.warn({ err }, 'SAML assertion parse error');
        return reply.status(400).send({ error: 'Invalid SAML assertion' });
      }

      const { email, tenant_id, attributes } = assertionData;

      const db = getDb();

      // Verify tenant is active
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.tenant_id, tenant_id), eq(tenants.status, 'active')))
        .limit(1);

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found or inactive' });
      }

      // Find or provision the user (JIT provisioning)
      let [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenant_id, tenant_id), eq(users.email, email.toLowerCase())))
        .limit(1);

      if (!user) {
        // JIT provision: create user with roles from SAML attributes
        const roles = (attributes['roles'] as string[] | undefined) ?? ['member'];
        const [created] = await db
          .insert(users)
          .values({
            tenant_id,
            email: email.toLowerCase(),
            password_hash: '', // SSO users have no local password
            roles,
            status: 'active',
          })
          .returning();
        if (!created) {
          return reply.status(500).send({ error: 'Failed to provision SSO user' });
        }
        user = created;
      }

      if (user.status !== 'active') {
        return reply.status(403).send({ error: 'Account is not active' });
      }

      const tokens = issueTokens(
        { user_id: user.user_id, tenant_id: user.tenant_id, roles: user.roles },
        config,
      );

      await refreshStore.save(tokens.refreshToken, {
        user_id: user.user_id,
        tenant_id: user.tenant_id,
        roles: user.roles,
      });

      // If RelayState contains a redirect URL, redirect there with tokens
      // Otherwise return JSON (for API-based SAML flows)
      if (relayState) {
        const redirectUrl = new URL(relayState);
        redirectUrl.searchParams.set('access_token', tokens.accessToken);
        redirectUrl.searchParams.set('refresh_token', tokens.refreshToken);
        return reply.redirect(302, redirectUrl.toString());
      }

      return reply.status(200).send({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
      });
    },
  );

  // OAuth 2.0 callback endpoint
  app.post(
    '/auth/sso/oauth/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, string> | undefined;
      const code = body?.['code'];
      const state = body?.['state'];
      const tenant_id = body?.['tenant_id'];

      if (!code || !tenant_id) {
        return reply.status(400).send({ error: 'Missing code or tenant_id' });
      }

      // In production, exchange the authorization code for an access token
      // using the tenant's configured OAuth provider (Google, Microsoft, etc.)
      // and validate the ID token claims.
      let oauthUser: OAuthUserInfo;
      try {
        oauthUser = await exchangeOAuthCode(code, tenant_id, state);
      } catch (err) {
        request.log.warn({ err }, 'OAuth code exchange error');
        return reply.status(400).send({ error: 'OAuth code exchange failed' });
      }

      const db = getDb();

      // Verify tenant is active
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.tenant_id, tenant_id), eq(tenants.status, 'active')))
        .limit(1);

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found or inactive' });
      }

      // Find or provision the user
      let [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenant_id, tenant_id), eq(users.email, oauthUser.email.toLowerCase())))
        .limit(1);

      if (!user) {
        const [created] = await db
          .insert(users)
          .values({
            tenant_id,
            email: oauthUser.email.toLowerCase(),
            password_hash: '', // OAuth users have no local password
            roles: ['member'],
            status: 'active',
          })
          .returning();
        if (!created) {
          return reply.status(500).send({ error: 'Failed to provision OAuth user' });
        }
        user = created;
      }

      if (user.status !== 'active') {
        return reply.status(403).send({ error: 'Account is not active' });
      }

      const tokens = issueTokens(
        { user_id: user.user_id, tenant_id: user.tenant_id, roles: user.roles },
        config,
      );

      await refreshStore.save(tokens.refreshToken, {
        user_id: user.user_id,
        tenant_id: user.tenant_id,
        roles: user.roles,
      });

      return reply.status(200).send({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
      });
    },
  );
}

// ─── SAML parsing stub ────────────────────────────────────────────────────────

interface SamlAssertionData {
  email: string;
  tenant_id: string;
  attributes: Record<string, unknown>;
}

/**
 * Parse and validate a base64-encoded SAML response.
 * In production, replace with a full SAML library (samlify, passport-saml).
 * This implementation decodes the assertion and extracts the NameID (email)
 * and custom attributes. Signature validation MUST be performed in production.
 */
function parseSamlAssertion(samlResponseBase64: string): SamlAssertionData {
  const xml = Buffer.from(samlResponseBase64, 'base64').toString('utf-8');

  // Extract NameID (email) — simplified XML parsing for the integration point
  const nameIdMatch = xml.match(/<(?:[^:>]+:)?NameID[^>]*>([^<]+)<\/(?:[^:>]+:)?NameID>/);
  const email = nameIdMatch?.[1]?.trim();
  if (!email) {
    throw new Error('NameID not found in SAML assertion');
  }

  // Extract tenant_id from Attribute
  const tenantMatch = xml.match(
    /<(?:[^:>]+:)?Attribute[^>]+Name="tenant_id"[^>]*>[\s\S]*?<(?:[^:>]+:)?AttributeValue[^>]*>([^<]+)<\/(?:[^:>]+:)?AttributeValue>/,
  );
  const tenant_id = tenantMatch?.[1]?.trim();
  if (!tenant_id) {
    throw new Error('tenant_id attribute not found in SAML assertion');
  }

  // Extract roles attribute if present
  const rolesMatch = xml.match(
    /<(?:[^:>]+:)?Attribute[^>]+Name="roles"[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Attribute>/,
  );
  const roles: string[] = [];
  if (rolesMatch?.[1]) {
    const valueMatches = rolesMatch[1].matchAll(
      /<(?:[^:>]+:)?AttributeValue[^>]*>([^<]+)<\/(?:[^:>]+:)?AttributeValue>/g,
    );
    for (const match of valueMatches) {
      if (match[1]) roles.push(match[1].trim());
    }
  }

  return {
    email,
    tenant_id,
    attributes: { roles: roles.length > 0 ? roles : ['member'] },
  };
}

// ─── OAuth code exchange stub ─────────────────────────────────────────────────

interface OAuthUserInfo {
  email: string;
  name?: string | undefined;
}

/**
 * Exchange an OAuth 2.0 authorization code for user info.
 * In production, this should:
 * 1. Look up the tenant's OAuth provider config (client_id, client_secret, token_url)
 * 2. POST to the token endpoint to exchange the code
 * 3. Validate the ID token (if OIDC) or call the userinfo endpoint
 * 4. Return the user's email and profile
 */
async function exchangeOAuthCode(
  code: string,
  tenantId: string,
  _state: string | undefined,
): Promise<OAuthUserInfo> {
  // Retrieve tenant OAuth config from environment or database
  // This is a structured integration point — wire to your OAuth provider config
  const tokenUrl = process.env[`OAUTH_TOKEN_URL_${tenantId.toUpperCase().replace(/-/g, '_')}`]
    ?? process.env['OAUTH_TOKEN_URL'];
  const clientId = process.env[`OAUTH_CLIENT_ID_${tenantId.toUpperCase().replace(/-/g, '_')}`]
    ?? process.env['OAUTH_CLIENT_ID'];
  const clientSecret = process.env[`OAUTH_CLIENT_SECRET_${tenantId.toUpperCase().replace(/-/g, '_')}`]
    ?? process.env['OAUTH_CLIENT_SECRET'];
  const redirectUri = process.env['OAUTH_REDIRECT_URI'];

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error(`OAuth provider not configured for tenant ${tenantId}`);
  }

  // Exchange code for tokens
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json() as Record<string, unknown>;

  // For OIDC providers, decode the id_token to get user info
  // For OAuth-only providers, call the userinfo endpoint
  const userinfoUrl = process.env['OAUTH_USERINFO_URL'];
  if (userinfoUrl && tokenData['access_token']) {
    const userinfoResponse = await fetch(userinfoUrl, {
      headers: { Authorization: `Bearer ${tokenData['access_token']}` },
    });
    if (userinfoResponse.ok) {
      const userinfo = await userinfoResponse.json() as Record<string, unknown>;
      const email = userinfo['email'] as string | undefined;
      if (!email) throw new Error('email not found in userinfo response');
      return { email, name: userinfo['name'] as string | undefined };
    }
  }

  // Fallback: decode id_token JWT claims (no signature verification here — use a library in prod)
  const idToken = tokenData['id_token'] as string | undefined;
  if (idToken) {
    const parts = idToken.split('.');
    if (parts.length === 3 && parts[1]) {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>;
      const email = claims['email'] as string | undefined;
      if (!email) throw new Error('email not found in id_token claims');
      return { email, name: claims['name'] as string | undefined };
    }
  }

  throw new Error('Could not extract user email from OAuth response');
}
