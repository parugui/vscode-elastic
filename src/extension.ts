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
import stripJsonComments from './helpers';
import { JsonPanel } from './jsonPanel';
import { logDebug, logError, logInfo, showOutput } from './logger';
const jsonPanel = new JsonPanel();

export async function activate(context: vscode.ExtensionContext) {
    getHost(context);
    const languages = ['es', 'elasticsearch'];
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(languages, new ElasticCodeLensProvider(context)));

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
        vscode.commands.registerCommand('extension.setHost', () => {
            setHost(context);
        }),
    );

    vscode.commands.registerCommand('extension.setClip', (uri, query) => {
        // var ncp = require('copy-paste');
        // ncp.copy(query, function () {
        // vscode.window.showInformationMessage('Copied to clipboard');
        // });
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.open', (em: ElasticMatch) => {
            var column = 0;
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
                logError("[Register command - extension.lint]", {error: error.message})
            }
        }),
    );
}

async function setHost(context: vscode.ExtensionContext): Promise<string> {
    const host = await vscode.window.showInputBox(<vscode.InputBoxOptions>{
        prompt: 'Please enter the elastic host',
        ignoreFocusOut: true,
        value: getHost(context),
    });

    context.workspaceState.update('elasticsearch.host', host);
    vscode.workspace.getConfiguration().update('elasticsearch.host', host);
    return host || 'localhost:9200';
}

export function getHost(context: vscode.ExtensionContext): string {
    return context.workspaceState.get('elasticsearch.host') || vscode.workspace.getConfiguration().get('elasticsearch.host', 'localhost:9200');
}

export function getExtraHeader(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('elastic');
    const extraHeaders = config.get<Record<string, string>>('extraHeaders') || {};
    return extraHeaders;
}

export async function executeQuery(context: vscode.ExtensionContext, resultsProvider: ElasticContentProvider, em: ElasticMatch) {
    let results: any;
    let response: AxiosResponse | AxiosError | any;
    let status: number | undefined;
    const host = getHost(context);
    const extraHeaders = getExtraHeader(context);
    const startTime = new Date().getTime();
    showOutput();

    const config = vscode.workspace.getConfiguration();
    var asDocument = config.get('elasticsearch.showResultAsDocument');

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

        logDebug('[executeQuery: Success]', { status: response.status });
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            status = error.response?.status;
            results = error.response?.data || error.message;

            logError('[executeQuery: Error]', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
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
