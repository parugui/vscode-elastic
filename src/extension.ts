import * as vscode from 'vscode';
import path = require('path');
import * as fs from 'fs';
import * as os from 'os';
import { ElasticCompletionItemProvider } from './ElasticCompletionItemProvider';
import { ElasticCodeLensProvider } from './ElasticCodeLensProvider';
import { ElasticContentProvider } from './ElasticContentProvider';
import { ElasticDecoration } from './ElasticDecoration';
import { ElasticMatch } from './ElasticMatch';
import { ElasticMatches } from './ElasticMatches';
import axios, { AxiosError, AxiosResponse } from 'axios';
import stripJsonComments, { isRecordEmpty } from './helpers';
import { JsonPanel } from './jsonPanel';
import { logDebug, logError, logInfo, showOutput } from './logger';
const jsonPanel = new JsonPanel();

let currentEnv: string | undefined;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    let currentEnv = (context.globalState.get('elastic.currentEnv') as string) || '';
    const languages = ['es', 'elasticsearch'];
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)));

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.command = 'elastic.changeEnvironment';
    context.subscriptions.push(statusBarItem);

    updateStatusBar();

    let resultsProvider = new ElasticContentProvider();
    vscode.workspace.registerTextDocumentContentProvider('elasticsearch', resultsProvider);

    let esMatches: ElasticMatches;
    let decoration: ElasticDecoration;

    function checkEditor(document: vscode.TextDocument): Boolean {
        if (document === vscode.window.activeTextEditor!.document && document.languageId == 'es') {
            if (esMatches == null || decoration == null) {
                esMatches = new ElasticMatches(vscode.window.activeTextEditor!);
                decoration = new ElasticDecoration(context);
            }
            return true;
        }
        return false;
    }

    if (vscode.window.activeTextEditor && checkEditor(vscode.window.activeTextEditor!.document)) {
        esMatches = new ElasticMatches(vscode.window.activeTextEditor!);
        decoration!.UpdateDecoration(esMatches);
    }

    vscode.workspace.onDidChangeTextDocument(e => {
        if (checkEditor(e.document)) {
            esMatches = new ElasticMatches(vscode.window.activeTextEditor!);
            decoration.UpdateDecoration(esMatches);
        }
    });

    vscode.window.onDidChangeTextEditorSelection(e => {
        if (checkEditor(e.textEditor.document)) {
            esMatches.UpdateSelection(e.textEditor);
            decoration.UpdateDecoration(esMatches);
        }
    });
    let esCompletionHover = new ElasticCompletionItemProvider(context);

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, esCompletionHover, '/', '?', '&', '"'));
    context.subscriptions.push(vscode.languages.registerHoverProvider(languages, esCompletionHover));

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.execute', (em: ElasticMatch) => {
            if (!em) {
                em = esMatches.Selection;
            }
            executeQuery(context, resultsProvider, em);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.open', (em: ElasticMatch) => {
            const column = 0;
            let uri = vscode.Uri.file(em.File.Text);
            return vscode.workspace
                .openTextDocument(uri)
                .then(textDocument =>
                    vscode.window.showTextDocument(
                        textDocument,
                        column ? (column > vscode.ViewColumn.Three ? vscode.ViewColumn.One : column) : undefined,
                        true,
                    ),
                );
        }),
    );

    function updateStatusBar() {
        if (currentEnv) {
            statusBarItem.text = `$(server) Elastic: ${currentEnv}`;
            statusBarItem.show();
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('elastic.changeEnvironment', async () => {
            const config = vscode.workspace.getConfiguration('elastic');
            const envs = config.get<Record<string, any>>('environments') || {};
            const picked = await vscode.window.showQuickPick(Object.keys(envs), {
                placeHolder: 'Select environment',
            });
            if (picked) {
                currentEnv = picked;
                context.globalState.update('elastic.currentEnv', picked);
                logDebug('[ElasticMatch - currentEnv]', { globalState: context.globalState.get('elastic.currentEnv') });
                updateStatusBar();
                vscode.window.setStatusBarMessage(`Elasic environment changed to ${picked}`, 5000);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('elastic.configureEnvironments', async () => {
            // The command "workbench.action.openSettings" open configuration interface
            await vscode.commands.executeCommand('workbench.action.openSettings', 'elastic.environments');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.lint', (em: ElasticMatch) => {
            try {
                let l = em.Method.Range.start.line + 1;
                const editor = vscode.window.activeTextEditor;
                const config = vscode.workspace.getConfiguration('editor');
                const tabSize = +(config.get('tabSize') as number);

                editor!.edit(editBuilder => {
                    if (em.HasBody) {
                        let txt = editor!.document.getText(em.Body.Range);
                        editBuilder.replace(em.Body.Range, JSON.stringify(JSON.parse(em.Body.Text), null, tabSize));
                    }
                });
            } catch (error: any) {
                console.log(error.message);
                logError('[Register command - extension.lint]', { error: error.message });
            }
        }),
    );
}

export function getCurrentEnvironment(context: vscode.ExtensionContext) {
    const environments = getEnvironments();

    logDebug('[ElasticMatch - currentEnv]', { globalState: context.globalState.get('elastic.currentEnv') });
    const currentEnv = context.globalState.get<string>('elastic.currentEnv') || '';

    if (!currentEnv) {
        logDebug(
            '[ElasticMatch - activate] - No active Elastic environment selected. Please choose one. To select, press Ctrl+Shift+P and run "Elastic: Change Environment".',
        );
        vscode.window.showWarningMessage('No active Elastic environment selected. Please choose one.', 'Choose now').then(selection => {
            if (selection === 'Choose now') {
                vscode.commands.executeCommand('elastic.changeEnvironment');
            }
        });
        return;
    }

    logInfo('[ElasticMatch - getCurrentEnvironment]', { environments: environments, currentEnv: currentEnv });
    return environments[currentEnv] || {};
}

export function getEnvironments() {
    const config = vscode.workspace.getConfiguration('elastic');
    const environments = config.get<Record<string, any>>('environments') || {};

    if (isRecordEmpty(environments)) {
        logDebug(
            '[ElasticMatch - getCurrentEnvironment] - No Elastic environment configured. Please set up your environments. To configure, press Ctrl+Shift+P and run "Elastic: Configure Environments".',
        );
        vscode.window.showWarningMessage('No Elastic environment configured. Please set them up.', 'Configure now').then(selection => {
            if (selection === 'Configure now') {
                vscode.commands.executeCommand('elastic.configureEnvironments');
            }
        });
        return {};
    }

    logInfo('[ElasticMatch - getEnvironments]', { environments: environments });
    return environments;
}

export function getHost(context: vscode.ExtensionContext): string {
    const env = getCurrentEnvironment(context);
    return env.host || 'localhost:9200';
}

export function getExtraHeader(context: vscode.ExtensionContext) {
    const env = getCurrentEnvironment(context);
    return env.extraHeaders || {};
}

export async function executeQuery(context: vscode.ExtensionContext, resultsProvider: ElasticContentProvider, em: ElasticMatch) {
    let results: any;
    let response: AxiosResponse | AxiosError | any;
    let status: number | undefined;
    const env = getCurrentEnvironment(context);
    const environments = getEnvironments();
    const host = env.host;
    const extraHeaders = env.extraHeaders;
    const startTime = new Date().getTime();
    showOutput();

    const config = vscode.workspace.getConfiguration();
    const asDocument = config.get('elasticsearch.showResultAsDocument');

    const sbi = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sbi.text = '$(search) Executing query ...';
    sbi.show();

    try {
        const body = stripJsonComments(em.Body.Text);
        let url = host + (em.Path.Text.startsWith('/') ? '' : '/') + em.Path.Text;

        logInfo('[executeQuery: Executing]', { method: em.Method.Text, url: url, headers: extraHeaders, body: body });

        response = await axios({
            url,
            method: em.Method.Text as any,
            data: body,
            headers: {
                'Content-Type': em.IsBulk ? 'application/x-ndjson' : 'application/json',
                ...extraHeaders,
            },
            validateStatus: () => true,
        });

        status = response.status;
        results = response.data;

        logDebug('[executeQuery: Success]', { status: status });
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            status = error.response?.status;
            results = error.response?.data || error.message;

            logError('[executeQuery: Error]', {
                message: error.message,
                status: status,
                data: results,
                error: error,
            });
        } else {
            results = error.message;
            logError('[executeQuery: unexpected error]', error);
        }
    }

    sbi.dispose();
    const endTime = new Date().getTime();

    if (asDocument) {
        try {
            const config = vscode.workspace.getConfiguration('editor');
            const tabSize = +(config.get('tabSize') as number);
            const pretty = JSON.stringify(results, null, tabSize);

            showResult(pretty, vscode.window.activeTextEditor!.viewColumn! + 1);
        } catch (error: any) {
            showResult(String(results), vscode.window.activeTextEditor!.viewColumn! + 1);
        }
    } else {
        jsonPanel.render(results, `ElasticSearch Results[${endTime - startTime}ms]`);
    }
}

function showResult(result: string, column?: vscode.ViewColumn): Thenable<void> {
    const tempResultFilePath = path.join(os.homedir(), '.vscode-elastic');
    const resultFilePath = vscode.workspace.rootPath || tempResultFilePath;

    let uri = vscode.Uri.file(path.join(resultFilePath, 'result.json'));
    if (!fs.existsSync(uri.fsPath)) {
        uri = uri.with({ scheme: 'untitled' });
    }
    return vscode.workspace
        .openTextDocument(uri)
        .then(textDocument =>
            vscode.window.showTextDocument(textDocument, column ? (column > vscode.ViewColumn.Three ? vscode.ViewColumn.One : column) : undefined, true),
        )
        .then(editor => {
            editor.edit(editorBuilder => {
                if (editor.document.lineCount > 0) {
                    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
                    editorBuilder.delete(
                        new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine.range.start.line, lastLine.range.end.character)),
                    );
                }
                editorBuilder.insert(new vscode.Position(0, 0), result);
            });
        });
}

// this method is called when your extension is deactivated
export function deactivate() {}
