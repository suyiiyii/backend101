import React, { useState } from 'react'

interface TestResult {
  endpoint: string
  url: string
  method: string
  expectedStatus: number
  actualStatus?: number
  expectedContentType?: string
  actualContentType?: string
  responseBody?: any
  passed: boolean
  reason?: string
}

const Judger: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState<string>('http://localhost:8080')
  const [results, setResults] = useState<TestResult[]>([])
  const [score, setScore] = useState<number>(0)
  const [testing, setTesting] = useState<boolean>(false)

  const testEndpoints = [
    {
      name: 'GET /todos',
      method: 'GET',
      path: '/todos',
      expectedStatus: 200,
      expectedContentType: 'application/json',
      validateBody: (body: any) => Array.isArray(body)
    },
    {
      name: 'GET /todos/{id} (existent)',
      method: 'GET',
      path: '/todos/1',
      expectedStatus: 200,
      expectedContentType: 'application/json',
      validateBody: (body: any) =>
        body &&
        typeof body.id === 'number' &&
        typeof body.title === 'string' &&
        typeof body.completed === 'boolean'
    },
    {
      name: 'GET /todos/{id} (non-existent)',
      method: 'GET',
      path: '/todos/99999',
      expectedStatus: 404
    },
    {
      name: 'POST /todos',
      method: 'POST',
      path: '/todos',
      expectedStatus: 201,
      expectedContentType: 'application/json',
      requestBody: { title: 'Test Todo', completed: false },
      validateBody: (body: any) =>
        body &&
        typeof body.id === 'number' &&
        typeof body.title === 'string' &&
        typeof body.completed === 'boolean'
    }
  ]

  const handleTest = async () => {
    setTesting(true)
    setResults([])
    let currentScore = 0

    for (const endpoint of testEndpoints) {
      const url = `${baseUrl}${endpoint.path}`
      const result: TestResult = {
        endpoint: endpoint.name,
        url,
        method: endpoint.method,
        expectedStatus: endpoint.expectedStatus,
        passed: false
      }

      try {
        const options: RequestInit = {
          method: endpoint.method,
          headers: {}
        }

        if (endpoint.method === 'POST' && endpoint.requestBody) {
          ;(options.headers as Record<string, string>)['Content-Type'] =
            'application/json'
          options.body = JSON.stringify(endpoint.requestBody)
        }

        const response = await fetch(url, options)
        result.actualStatus = response.status
        result.actualContentType =
          response.headers.get('Content-Type') || undefined

        let responseBody
        const contentType = response.headers.get('Content-Type')
        if (contentType && contentType.includes('application/json')) {
          responseBody = await response.json()
          result.responseBody = responseBody
        } else {
          result.responseBody = 'Response is not JSON'
        }

        let passed = result.actualStatus === result.expectedStatus
        if (passed && endpoint.expectedContentType) {
          if (
            !result.actualContentType ||
            !result.actualContentType.includes(endpoint.expectedContentType)
          ) {
            passed = false
            result.reason = `Content-Type mismatch. Expected: ${endpoint.expectedContentType}, Actual: ${result.actualContentType}`
          }
        }
        if (passed && endpoint.validateBody) {
          if (!endpoint.validateBody(responseBody)) {
            passed = false
            result.reason = 'Response body validation failed.'
          }
        }

        if (
          passed &&
          endpoint.name === 'GET /todos/{id} (existent)' &&
          responseBody &&
          responseBody.id !== 1
        ) {
          passed = false
          result.reason = `Expected id to be 1, but got ${responseBody.id}`
        }

        result.passed = passed
        if (passed) {
          currentScore++
        } else if (!result.reason) {
          result.reason = `Status code mismatch. Expected: ${result.expectedStatus}, Actual: ${result.actualStatus}`
        }
      } catch (error: any) {
        result.passed = false
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          result.reason =
            'Network error or CORS issue. Check browser console and ensure backend allows requests from this origin.'
        } else {
          result.reason = `Request failed: ${error.message}`
        }
      }
      setResults((prevResults) => [...prevResults, result])
    }
    setScore(currentScore)
    setTesting(false)
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">ToDo API Tester</h1>
      <div className="mb-4">
        <label
          htmlFor="baseUrl"
          className="block text-sm font-medium text-gray-700"
        >
          Backend Base URL:
        </label>
        <input
          type="text"
          id="baseUrl"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
        />
      </div>
      <button
        onClick={handleTest}
        disabled={testing}
        className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {testing ? 'Testing...' : 'Start Test'}
      </button>

      <div className="mt-6">
        <h2 className="text-xl font-semibold">
          Test Results (Score: {score}/{testEndpoints.length})
        </h2>
        {results.length === 0 && !testing && (
          <p>Click "Start Test" to run the API tests.</p>
        )}
        {results.map((result, index) => (
          <div
            key={index}
            className={`mt-4 rounded border p-4 ${
              result.passed
                ? 'border-green-500 bg-green-50'
                : 'border-red-500 bg-red-50'
            }`}
          >
            <h3 className="font-semibold">{result.endpoint}</h3>
            <p>URL: {result.url}</p>
            <p>Method: {result.method}</p>
            <p>Expected Status: {result.expectedStatus}</p>
            <p>Actual Status: {result.actualStatus ?? 'N/A'}</p>
            {result.expectedContentType && (
              <p>Expected Content-Type: {result.expectedContentType}</p>
            )}
            {result.actualContentType && (
              <p>Actual Content-Type: {result.actualContentType}</p>
            )}
            <p>
              Passed:{' '}
              <span
                className={
                  result.passed
                    ? 'font-bold text-green-700'
                    : 'font-bold text-red-700'
                }
              >
                {result.passed ? 'Yes' : 'No'}
              </span>
            </p>
            {!result.passed && result.reason && <p>Reason: {result.reason}</p>}
            {result.responseBody && (
              <div>
                <p>Response Body:</p>
                <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-sm">
                  {typeof result.responseBody === 'object'
                    ? JSON.stringify(result.responseBody, null, 2)
                    : result.responseBody}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Judger
