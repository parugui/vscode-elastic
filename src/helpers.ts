import Mustache = require('mustache');
import { ITemplateItem } from './ElasticMatch';

const singleComment = Symbol('singleComment');
const multiComment = Symbol('multiComment');

const stripWithoutWhitespace = () => '';
const stripWithWhitespace = (string: string, start?: number, end?: number) => string.slice(start, end).replace(/\S/g, ' ');

const isEscaped = (jsonString: string, quotePosition: number) => {
    let index = quotePosition - 1;
    let backslashCount = 0;

    while (jsonString[index] === '\\') {
        index -= 1;
        backslashCount += 1;
    }

    return Boolean(backslashCount % 2);
};

export default function stripJsonComments(jsonString: string, { whitespace = true } = {}) {
    if (typeof jsonString !== 'string') {
        throw new TypeError(`Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``);
    }

    const strip = whitespace ? stripWithWhitespace : stripWithoutWhitespace;

    let isInsideString: any = false;
    let isInsideComment: any = false;
    let offset = 0;
    let result = '';

    for (let index = 0; index < jsonString.length; index++) {
        const currentCharacter = jsonString[index];
        const nextCharacter = jsonString[index + 1];

        if (!isInsideComment && currentCharacter === '"') {
            const escaped = isEscaped(jsonString, index);
            if (!escaped) {
                isInsideString = !isInsideString;
            }
        }

        if (isInsideString) {
            continue;
        }

        if (!isInsideComment && currentCharacter + nextCharacter === '//') {
            result += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = singleComment;
            index++;
        } else if (isInsideComment === singleComment && currentCharacter + nextCharacter === '\r\n') {
            index++;
            isInsideComment = false;
            result += strip(jsonString, offset, index);
            offset = index;
            continue;
        } else if (isInsideComment === singleComment && currentCharacter === '\n') {
            isInsideComment = false;
            result += strip(jsonString, offset, index);
            offset = index;
        } else if (!isInsideComment && currentCharacter + nextCharacter === '/*') {
            result += jsonString.slice(offset, index);
            offset = index;
            isInsideComment = multiComment;
            index++;
            continue;
        } else if (isInsideComment === multiComment && currentCharacter + nextCharacter === '*/') {
            index++;
            isInsideComment = false;
            result += strip(jsonString, offset, index + 1);
            offset = index + 1;
            continue;
        }
    }

    return result + (isInsideComment ? strip(jsonString.slice(offset)) : jsonString.slice(offset));
}

export function handleTemplate(jsonString: string) {
    if (typeof jsonString !== 'string') {
        throw new TypeError(`Expected argument \`jsonString\` to be a \`string\`, got \`${typeof jsonString}\``);
    }

    const validTemplate = Mustache.render(jsonString, {});
    let parsed = JSON.parse(validTemplate); //Make sure template is valid format

    if (parsed) {
        const source = extractScriptSource(jsonString);

        if (source) {
            const template: ITemplateItem = {
                script: {
                    lang: 'mustache',
                    source: source,
                },
            };

            const templateJson = JSON.stringify(template);

            const validScriptSource = Mustache.render(templateJson, {});
            parsed = JSON.parse(validScriptSource); //Make sure template is valid after extractScriptSource

            if (parsed) {
                return templateJson;
            }
        }
    }

    return jsonString;
}

export function extractScriptSource(jsonText: string): string | null {
    const normalizedJson = jsonText.replace(/\s/g, '');

    const startIndex = normalizedJson.indexOf('"source":{');

    // If doesnt find, return null
    if (startIndex === -1) {
        return null;
    }

    const contentStartIndex = startIndex + '"source":{'.length;
    let balance = 1;
    let endIndex = contentStartIndex;

    // Iterates through the string to find the matching closing brace
    while (endIndex < normalizedJson.length && balance > 0) {
        const char = normalizedJson[endIndex];
        if (char === '{') {
            balance++;
        } else if (char === '}') {
            balance--;
        }
        endIndex++;
    }

    if (balance === 0) {
        // Returns the content including the opening and closing braces
        return normalizedJson.substring(contentStartIndex - 1, endIndex);
    }

    return null;
}

export function isRecordEmpty(obj: Record<string, any> | null | undefined): boolean {
    if (obj === null || obj === undefined) {
        return true;
    }

    return Object.keys(obj).length === 0;
}
