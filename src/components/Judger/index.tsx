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
      path: '/todos/1', // Assumes a todo with ID 1 exists from initial backend data
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
    },
    {
      name: 'POST /todos, then GET and Validate',
      method: 'POST', // Initial method
      path: '/todos',
      expectedStatus: 201, // Expected for the initial POST
      expectedContentType: 'application/json', // Expected for the initial POST
      requestBody: { title: 'Validate Me Todo', completed: false },
      // validateBody for POST response: checks if ID is returned and matches sent data
      validateBody: (body: any, requestBody: any) =>
        body &&
        typeof body.id === 'number' &&
        body.title === requestBody.title &&
        body.completed === requestBody.completed,
      isSequentialTest: true // Flag for special handling
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
        passed: false,
        reason: ''
      }

      if (endpoint.isSequentialTest) {
        result.method = 'POST then GET' // Update method display for this test
        let postResponseBody: any
        let postId: number | undefined
        const postRequestData = endpoint.requestBody

        // Step 1: Perform POST request
        try {
          const postOptions: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postRequestData)
          }
          const postResponse = await fetch(url, postOptions)
          result.actualStatus = postResponse.status
          result.actualContentType =
            postResponse.headers.get('Content-Type') || undefined

          const postResponseContentType =
            postResponse.headers.get('Content-Type')
          if (
            postResponseContentType &&
            postResponseContentType.includes('application/json')
          ) {
            postResponseBody = await postResponse.json()
            result.responseBody = { post: postResponseBody } // Store POST response
          } else {
            postResponseBody = await postResponse.text()
            result.responseBody = { post: postResponseBody }
            result.passed = false
            result.reason = 'POST response is not JSON.'
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate POST status
          if (postResponse.status !== endpoint.expectedStatus) {
            result.passed = false
            result.reason = `POST failed: Status mismatch. Expected ${endpoint.expectedStatus}, got ${postResponse.status}.`
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate POST content type
          if (
            endpoint.expectedContentType &&
            (!result.actualContentType ||
              !result.actualContentType.includes(endpoint.expectedContentType))
          ) {
            result.passed = false
            result.reason = `POST failed: Content-Type mismatch. Expected ${endpoint.expectedContentType}, got ${result.actualContentType}.`
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate POST response body using endpoint.validateBody
          if (
            endpoint.validateBody &&
            !endpoint.validateBody(postResponseBody, postRequestData)
          ) {
            result.passed = false
            result.reason =
              'POST failed: Response body validation failed against request data or ID missing.'
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          postId = postResponseBody.id
          if (typeof postId !== 'number') {
            result.passed = false
            result.reason =
              'POST failed: ID not found or not a number in response body.'
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Step 2: Perform GET request using the ID from POST response
          const getUrl = `${baseUrl}/todos/${postId}`
          result.url = `${url} (POST), then ${getUrl} (GET)` // Update URL display

          const getResponse = await fetch(getUrl, { method: 'GET' })
          const getActualStatus = getResponse.status
          const getActualContentType =
            getResponse.headers.get('Content-Type') || undefined
          let getResponseBody: any

          const getResponseContentType = getResponse.headers.get('Content-Type')
          if (
            getResponseContentType &&
            getResponseContentType.includes('application/json')
          ) {
            getResponseBody = await getResponse.json()
            result.responseBody = {
              post: postResponseBody,
              get: getResponseBody
            } // Store both responses
          } else {
            getResponseBody = await getResponse.text()
            result.responseBody = {
              post: postResponseBody,
              get: getResponseBody
            }
            result.passed = false
            result.reason = `GET /todos/${postId} failed: Response is not JSON.`
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate GET status (expected 200)
          if (getActualStatus !== 200) {
            result.passed = false
            result.reason = `GET /todos/${postId} failed: Status mismatch. Expected 200, got ${getActualStatus}.`
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate GET content type (expected application/json)
          if (
            !getActualContentType ||
            !getActualContentType.includes('application/json')
          ) {
            result.passed = false
            result.reason = `GET /todos/${postId} failed: Content-Type mismatch. Expected application/json, got ${getActualContentType}.`
            setResults((prevResults) => [...prevResults, result])
            continue
          }

          // Validate GET response body against original POST request data
          if (
            getResponseBody.id === postId &&
            getResponseBody.title === postRequestData.title &&
            getResponseBody.completed === postRequestData.completed
          ) {
            result.passed = true
            currentScore++
          } else {
            result.passed = false
            result.reason = `GET /todos/${postId} failed: Response body does not match original POST data. Expected title: "${postRequestData.title}", got "${getResponseBody.title}". Expected completed: ${postRequestData.completed}, got ${getResponseBody.completed}.`
          }
        } catch (error: any) {
          result.passed = false
          if (
            error instanceof TypeError &&
            error.message === 'Failed to fetch'
          ) {
            result.reason =
              'Network error or CORS issue during sequential test. Check console.'
          } else {
            result.reason = `Sequential test request failed: ${error.message}`
          }
        }
      } else {
        // Existing logic for single-request tests
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
            responseBody = await response.text() // Get text for non-JSON for logging
            result.responseBody = responseBody
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
          // For non-sequential tests, validateBody takes only responseBody
          if (passed && endpoint.validateBody) {
            // Pass endpoint.requestBody only if validateBody expects it (e.g. for POST validation)
            const isValid =
              endpoint.method === 'POST' &&
              endpoint.name !== 'POST /todos, then GET and Validate'
                ? endpoint.validateBody(responseBody, endpoint.requestBody)
                : endpoint.validateBody(responseBody)
            if (!isValid) {
              passed = false
              result.reason = 'Response body validation failed.'
            }
          }

          // Specific validation for GET /todos/1 to check ID, if not already covered by a more generic validateBody
          if (
            passed &&
            endpoint.name === 'GET /todos/{id} (existent)' &&
            responseBody &&
            typeof responseBody.id === 'number' && // ensure id exists before checking
            responseBody.id !== 1 // Assuming path is /todos/1
          ) {
            // This check might be redundant if validateBody is comprehensive
            // For example, if path was dynamic like /todos/${someId}, this check would be: responseBody.id !== someId
            // Given path is hardcoded to /todos/1, we check against 1.
            if (endpoint.path === '/todos/1' && responseBody.id !== 1) {
              passed = false
              result.reason = `Expected id to be 1 for ${endpoint.path}, but got ${responseBody.id}`
            }
          }

          result.passed = passed
          if (passed) {
            currentScore++
          } else if (!result.reason) {
            if (result.actualStatus !== result.expectedStatus) {
              result.reason = `Status code mismatch. Expected: ${result.expectedStatus}, Actual: ${result.actualStatus}`
            } else {
              result.reason =
                'Test failed for an unknown reason after passing status and content type checks.'
            }
          }
        } catch (error: any) {
          result.passed = false
          if (
            error instanceof TypeError &&
            error.message === 'Failed to fetch'
          ) {
            result.reason =
              'Network error or CORS issue. Check browser console and ensure backend allows requests from this origin.'
          } else {
            result.reason = `Request failed: ${error.message}`
          }
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
