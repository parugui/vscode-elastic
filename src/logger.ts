import * as vscode from "vscode";


const outputChannel = vscode.window.createOutputChannel("Elasticsearch for VSCode");

function showVerboseLogs(): boolean {
    return vscode.workspace.getConfiguration("elastic").get<boolean>("showVerboseLogs", false);
}

function formatLog(level: 'Info' | 'Error' | 'Debug', message: string, details?: any): string {
    const timestamp = new Date().toISOString(); // formato ISO yyyy-MM-ddTHH:mm:ss.sssZ

    let log = `${timestamp} [${level}] ${message}`;
    if (details) {
        log += `\n${JSON.stringify(details, null, 2)}`;
    }
    return log;
}

export function logInfo(message: string, details?: any) {
  if (showVerboseLogs()) {
    outputChannel.appendLine(formatLog('Info', message, details));
  }
}

export function logError(message: string, details?: any) {
  if (showVerboseLogs()) {
    outputChannel.appendLine(formatLog('Error', message, details));
  }
}

export function logDebug(message: string, details?: any) {
  if (showVerboseLogs()) {
    outputChannel.appendLine(formatLog('Debug', message, details));
  }
}

export function showOutput() {
    if (showVerboseLogs()) {
        outputChannel.show(true);
    }
}
