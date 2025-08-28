import axios from 'axios';
import * as vscode from 'vscode';
import { logDebug, logError, showOutput } from './logger';

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const config = vscode.workspace.getConfiguration('elastic');
const extraHeaders = config.get<Record<string, string>>('extraHeaders') || {};

const axiosIntance = axios.create({
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...extraHeaders,
    },
});

axiosIntance.interceptors.request.use(request => {
    showOutput()
    logDebug('[axiosIntance : Request]', {
        method: request.method,
        url: request.url,
        headers: request.headers,
        payload: request.data
    });
    return request;
});

axiosIntance.interceptors.response.use(
    response => {
        logDebug('[axiosIntance : Response]', {
            status: response.status,
            statusText: response.statusText,
            body: response.data
        });
        return response;
    },
    error => {
        logError('[axiosIntance : Request Error]', {
            message: error.message,
            status: error.response?.status,
            body: error.response?.data
        });
        return Promise.reject(error);
    },
);

export default axiosIntance;
