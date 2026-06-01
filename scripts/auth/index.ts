export interface AuthAdapter {
  name: string;
  loginUrl: string;
  waitForUrl: string; // Global pattern. Confirms successful login
}

export const adapters: Record<string, AuthAdapter> = {
  linkedin: {
    name: 'LinkedIn',
    loginUrl: 'https://www.linkedin.com/login',
    waitForUrl: '**/feed/**',
  },
  indeed: {
    name: 'Indeed',
    loginUrl: 'https://secure.indeed.com/account/login',
    waitForUrl: 'profile**',
  },
  ziprecruiter: {
    name: 'ZipRecruiter',
    loginUrl: 'https://www.ziprecruiter.com/authn/login',
    waitForUrl: 'https://www.ziprecruiter.com/jobseeker/home',
  },
  google: {
    name: 'Google',
    loginUrl: 'https://accounts.google.com/signin',
    waitForUrl: 'https://myaccount.google.com/**',
  },
};