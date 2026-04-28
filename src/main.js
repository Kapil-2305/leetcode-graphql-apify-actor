import { Actor, log } from 'apify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
};

const normalizeVariableExamples = (examples) => {
    if (!Array.isArray(examples) || examples.length === 0) return [{}];
    return examples.map((item) => (item && typeof item === 'object' ? item : {}));
};

const toLowerSet = (list) => new Set((Array.isArray(list) ? list : []).map((item) => String(item).toLowerCase()));

const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

await Actor.main(async () => {
    const input = (await Actor.getInput()) ?? {};

    const endpoint = String(input.endpoint || 'https://leetcode.com/graphql/').trim();
    const includeOperationNames = new Set(Array.isArray(input.includeOperationNames) ? input.includeOperationNames.map(String) : []);
    const includeSourcePaths = new Set(Array.isArray(input.includeSourcePaths) ? input.includeSourcePaths.map(String) : []);
    const includeOperationTypes = toLowerSet(input.includeOperationTypes);
    const variablesOverrides = toObject(input.variablesOverrides);
    const runAllVariableExamples = Boolean(input.runAllVariableExamples);
    const maxOperations = Number(input.maxOperations || 0);
    const requestDelayMs = Number(input.requestDelayMs || 0);
    const requestTimeoutSec = Number(input.requestTimeoutSec || 30);
    const failActorIfAnyFail = Boolean(input.failActorIfAnyFail);

    const defaultHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer: 'https://leetcode.com/',
    };
    const headers = { ...defaultHeaders, ...toObject(input.headers) };

    const rawCatalog = await readFile(path.join(__dirname, 'queries.json'), 'utf8');
    const catalog = JSON.parse(rawCatalog);
    let operations = Array.isArray(catalog.operations) ? catalog.operations : [];

    if (includeOperationNames.size > 0) {
        operations = operations.filter((op) => includeOperationNames.has(String(op.operation_name)));
    }
    if (includeSourcePaths.size > 0) {
        operations = operations.filter((op) => includeSourcePaths.has(String(op.source_path)));
    }
    if (includeOperationTypes.size > 0) {
        operations = operations.filter((op) => includeOperationTypes.has(String(op.operation_type || '').toLowerCase()));
    }
    if (maxOperations > 0) {
        operations = operations.slice(0, maxOperations);
    }

    if (operations.length === 0) {
        const emptySummary = {
            endpoint,
            totalChecks: 0,
            totalOperations: 0,
            statusCounts: {},
            message: 'No operations matched your filters.',
            filters: {
                includeOperationNames: [...includeOperationNames],
                includeSourcePaths: [...includeSourcePaths],
                includeOperationTypes: [...includeOperationTypes],
                maxOperations,
            },
            checkedAt: new Date().toISOString(),
        };
        await Actor.setValue('VALIDATION_SUMMARY', emptySummary);
        log.warning('No operations matched filters. Exiting without requests.');
        return;
    }

    const checks = [];
    for (const op of operations) {
        const override = variablesOverrides[op.operation_name];
        const variableExamples = override ? [override] : normalizeVariableExamples(op.variables_examples);
        const selectedExamples = (runAllVariableExamples && !override) ? variableExamples : [variableExamples[0]];
        selectedExamples.forEach((variables, index) => {
            checks.push({
                sourcePath: op.source_path,
                operationType: op.operation_type,
                operationName: op.operation_name,
                query: op.query,
                variables,
                variableExampleIndex: index,
            });
        });
    }

    log.info(`Prepared ${checks.length} checks from ${operations.length} operations.`);

    const results = [];
    for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        const startedAt = Date.now();

        const payload = {
            operationName: check.operationName,
            query: check.query,
            variables: check.variables ?? {},
        };

        let status = 'ok';
        let httpStatus = null;
        let errorMessages = [];
        let extractedData = null;
        let responseErrors = [];

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
                responseErrors = body.errors.map((error) => error?.message || 'Unknown GraphQL error');
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
            checkNumber: i + 1,
            sourcePath: check.sourcePath,
            operationType: check.operationType,
            operationName: check.operationName,
            variableExampleIndex: check.variableExampleIndex,
            variables: check.variables,
            status,
            httpStatus,
            durationMs,
            data: extractedData,
            errorMessages,
            checkedAt: new Date().toISOString(),
        };
        results.push(result);

        const progress = `${i + 1}/${checks.length}`;
        if (status === 'ok') {
            log.info(`[${progress}] OK ${check.operationName} (${durationMs} ms)`);
        } else {
            log.warning(`[${progress}] ${status.toUpperCase()} ${check.operationName} (${durationMs} ms): ${errorMessages.join(' | ')}`);
        }

        if (requestDelayMs > 0 && i < checks.length - 1) {
            await sleep(requestDelayMs);
        }
    }

    const statusCounts = results.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
    }, {});

    const summary = {
        endpoint,
        totalOperations: operations.length,
        totalChecks: results.length,
        statusCounts,
        passedChecks: statusCounts.ok || 0,
        failedChecks: results.length - (statusCounts.ok || 0),
        filters: {
            includeOperationNames: [...includeOperationNames],
            includeSourcePaths: [...includeSourcePaths],
            includeOperationTypes: [...includeOperationTypes],
            maxOperations,
            runAllVariableExamples,
        },
        requestConfig: {
            requestDelayMs,
            requestTimeoutSec,
        },
        checkedAt: new Date().toISOString(),
    };

    for (const batch of chunk(results, 50)) {
        await Actor.pushData(batch);
    }

    await Actor.setValue('EXTRACTION_SUMMARY', summary);
    await Actor.setValue('EXTRACTION_RESULTS', results);

    log.info(`Completed. Summary: ${JSON.stringify(summary.statusCounts)}`);

    if (failActorIfAnyFail && summary.failedChecks > 0) {
        throw new Error(`Extraction failed: ${summary.failedChecks} checks failed.`);
    }
});
