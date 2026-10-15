import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ADMIN_DESTINATION,
  ROUTES,
  safeAdminPath,
  signInPathFor,
  signInReason,
} from './routes';

describe('safeAdminPath', () => {
  it('accepts the admin root and its descendants', () => {
    expect(safeAdminPath('/admin')).toBe('/admin');
    expect(safeAdminPath('/admin/inscricoes')).toBe('/admin/inscricoes');
    expect(safeAdminPath('/admin/configuracoes')).toBe('/admin/configuracoes');
    expect(safeAdminPath('/admin/inscricoes/')).toBe('/admin/inscricoes/');
  });

  it('preserves a query string on an admin path', () => {
    expect(safeAdminPath('/admin/inscricoes?busca=ana&status=confirmed')).toBe(
      '/admin/inscricoes?busca=ana&status=confirmed',
    );
  });

  it.each([
    ['absolute http URL', 'https://evil.example'],
    ['absolute URL with an admin path', 'https://evil.example/admin'],
    ['protocol-relative', '//evil.example'],
    ['protocol-relative, encoded', '%2F%2Fevil.example'],
    ['protocol-relative, double encoded', '%252F%252Fevil.example'],
    ['backslash protocol-relative', '/\\evil.example'],
    ['backslash, encoded', '/%5Cevil.example'],
    ['encoded absolute URL', 'https%3A%2F%2Fevil.example'],
    ['scheme-only', 'javascript:alert(1)'],
    ['encoded scheme', 'javascript%3Aalert(1)'],
    ['data URL', 'data:text/html,<script>'],
    ['path traversal out of /admin', '/admin/../evil'],
    ['path traversal, encoded', '/admin/..%2Fevil'],
    ['dot segment', '/admin/./x'],
    ['outside the admin area', '/'],
    ['outside the admin area, deep', '/privacidade'],
    ['a prefix that only looks like admin', '/administrador'],
    ['userinfo trick', '/admin@evil.example'],
    ['newline header split', '/admin\nLocation: https://evil.example'],
    ['encoded newline', '/admin%0ALocation:%20https://evil.example'],
    ['carriage return', '/admin\r\nSet-Cookie: a=b'],
    ['tab', '/admin\t/x'],
    ['null byte', '/admin%00/x'],
    ['empty', ''],
    ['relative', 'admin/inscricoes'],
    ['relative dot', './admin'],
  ])('rejects %s', (_label, candidate) => {
    expect(safeAdminPath(candidate)).toBe(DEFAULT_ADMIN_DESTINATION);
  });

  it('rejects the sign-in surfaces themselves, which would loop', () => {
    expect(safeAdminPath('/admin/entrar')).toBe(DEFAULT_ADMIN_DESTINATION);
    expect(safeAdminPath('/admin/entrar/')).toBe(DEFAULT_ADMIN_DESTINATION);
    expect(safeAdminPath('/admin/sem-acesso')).toBe(DEFAULT_ADMIN_DESTINATION);
  });

  it('rejects absent, non-string and oversized values', () => {
    expect(safeAdminPath(undefined)).toBe(DEFAULT_ADMIN_DESTINATION);
    expect(safeAdminPath(null)).toBe(DEFAULT_ADMIN_DESTINATION);
    expect(safeAdminPath(`/admin/${'a'.repeat(600)}`)).toBe(DEFAULT_ADMIN_DESTINATION);
  });

  it('always returns an internal path, whatever it is given', () => {
    const hostile = ['//x', 'https://x', '/\\x', '/admin/../../x', '%2e%2e%2fx', '#/admin'];
    for (const candidate of hostile) {
      expect(safeAdminPath(candidate).startsWith('/admin')).toBe(true);
    }
  });
});

describe('signInPathFor', () => {
  it('omits `next` when the destination is the default', () => {
    expect(signInPathFor('/admin')).toBe(ROUTES.adminSignIn);
    expect(signInPathFor('https://evil.example')).toBe(ROUTES.adminSignIn);
  });

  it('carries a validated destination and a reason', () => {
    expect(signInPathFor('/admin/inscricoes')).toBe('/admin/entrar?next=%2Fadmin%2Finscricoes');
    expect(signInPathFor('/admin/inscricoes', 'sessao-expirada')).toBe(
      '/admin/entrar?next=%2Fadmin%2Finscricoes&motivo=sessao-expirada',
    );
  });
});

describe('signInReason', () => {
  it('accepts only the documented reasons', () => {
    expect(signInReason('sessao-expirada')).toBe('sessao-expirada');
    expect(signInReason('link-invalido')).toBe('link-invalido');
    expect(signInReason('demo-indisponivel')).toBe('demo-indisponivel');
    expect(signInReason(['sessao-expirada'])).toBe('sessao-expirada');
  });

  it('never echoes an arbitrary query parameter', () => {
    expect(signInReason('<script>')).toBeNull();
    expect(signInReason(undefined)).toBeNull();
    expect(signInReason('')).toBeNull();
  });
});
