import { Actor, log } from 'apify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const toObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
};

await Actor.main(async () => {
    const input = (await Actor.getInput()) ?? {};

    const endpoint = String(input.endpoint || 'https://leetcode.com/graphql/').trim();
    const operationName = input.operationName;
    const requestTimeoutSec = 30;

    if (!operationName) {
        throw new Error('You must provide an "operationName" in the input.');
    }

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://leetcode.com/',
    };
    const headers = { ...defaultHeaders, ...toObject(input.headers) };

    const rawCatalog = await readFile(path.join(__dirname, 'queries.json'), 'utf8');
    const catalog = JSON.parse(rawCatalog);
    const operations = Array.isArray(catalog.operations) ? catalog.operations : [];

    const operation = operations.find((op) => op.operation_name === operationName);
    if (!operation) {
        throw new Error(`Operation "${operationName}" not found in the queries catalog.`);
    }

    // Merge default variables with user-provided overrides
    const defaultVariables = operation.variables_examples && operation.variables_examples.length > 0 
        ? operation.variables_examples[0] 
        : {};
        
    const variables = { ...defaultVariables, ...toObject(input.customVariables) };
    
    // Apply specific UI fields if they exist
    if (input.username) variables.username = input.username;
    if (input.titleSlug) variables.titleSlug = input.titleSlug;
    if (typeof input.limit === 'number') variables.limit = input.limit;
    if (typeof input.offset === 'number') variables.offset = input.offset;

    log.info(`Executing ${operationName}...`, { variables });

    const startedAt = Date.now();
    const payload = {
        operationName: operation.operation_name,
        query: operation.query,
        variables,
    };

    let status = 'ok';
    let httpStatus = null;
    let errorMessages = [];
    let extractedData = null;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(requestTimeoutSec * 1000),
        });

        httpStatus = response.status;
        const text = await response.text();

        let body;
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { rawText: text };
        }

        if (!response.ok) {
            status = 'request_failed';
            errorMessages.push(`HTTP ${response.status}`);
        }

        if (Array.isArray(body?.errors) && body.errors.length > 0) {
            status = response.ok ? 'graphql_error' : status;
            const responseErrors = body.errors.map((err) => err?.message || 'Unknown GraphQL error');
            errorMessages.push(...responseErrors);
        }

        if (body?.data && typeof body.data === 'object') {
            extractedData = body.data;
        }
    } catch (error) {
        status = 'request_failed';
        errorMessages = [error?.message || String(error)];
    }

    const durationMs = Date.now() - startedAt;
    
    const result = {
        operationType: operation.operation_type,
        operationName: operation.operation_name,
        variables,
        status,
        httpStatus,
        durationMs,
        data: extractedData,
        errorMessages,
        checkedAt: new Date().toISOString(),
    };

    // Store the extracted data
    await Actor.pushData(result);

    // Save summary
    await Actor.setValue('EXTRACTION_SUMMARY', {
        endpoint,
        operationName,
        status,
        durationMs,
        checkedAt: result.checkedAt
    });

    if (status === 'ok') {
        log.info(`Successfully extracted data for ${operationName} (${durationMs} ms)`);
    } else {
        log.error(`Extraction failed for ${operationName} (${durationMs} ms): ${errorMessages.join(' | ')}`);
        throw new Error(`Extraction failed: ${errorMessages.join(' | ')}`);
    }
});
