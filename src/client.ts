import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();

const impit = new Impit({
    browser: 'firefox',
    cookieJar: jar,
});

export class ImpitError extends Error {
    response: any;

    constructor(response: any) {
        super(`Request failed: ${response.status}`);
        this.name = 'ImpitError';
        this.response = response;
    }
}

type RequestOptions = {
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    validateStatus?: (status: number) => boolean;
    redirect?: 'follow' | 'manual' | 'error';
};

function buildUrl(url: string, params?: RequestOptions['params']) {
    const parsed = new URL(url);

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            parsed.searchParams.set(k, String(v));
        }
    }

    return parsed.toString();
}

export async function ImpitGet(url: string, { params, headers, validateStatus, redirect }: RequestOptions = {}) {
    const finalUrl = buildUrl(url, params);
    const options: any = {};

    if (headers) {
        options.headers = headers;
    }

    if (redirect) {
        options.redirect = redirect;
    }

    const response = await impit.fetch(finalUrl, options);

    if (validateStatus ? !validateStatus(response.status) : response.status >= 400) {
        throw new ImpitError(response);
    }

    const data = await response.text();

    return {
        data,
        status: response.status,
        headers: response.headers,
        url: response.url ?? finalUrl,
    };
}

export async function ImpitPost(url: string, body: string, { headers, validateStatus, redirect }: RequestOptions = {}) {
    const options: any = { method: 'POST', body };

    if (headers) {
        options.headers = headers;
    }

    if (redirect) {
        options.redirect = redirect;
    }

    const response = await impit.fetch(url, options);

    if (validateStatus ? !validateStatus(response.status) : response.status >= 400) {
        throw new ImpitError(response);
    }

    return {
        data: await response.text(),
        status: response.status,
        headers: response.headers,
        url: response.url ?? url,
    };
}

export async function ImpitJson<T = unknown>(url: string, options: RequestOptions = {}) {
    const res = await ImpitGet(url, options);

    return {
        ...res,
        json: JSON.parse(res.data) as T,
    };
}