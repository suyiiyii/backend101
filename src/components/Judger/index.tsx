import React, { useState, useEffect } from 'react'

interface TestResult {
  id: string
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
  testStatus: 'pending' | 'running' | 'passed' | 'failed'
}

interface TestEndpointConfig {
  name: string
  method: 'GET' | 'POST'
  path: string
  expectedStatus: number
  expectedContentType?: string
  requestBody?: any
  validateBody?: (responseBody: any, requestBody?: any) => boolean
  isSequentialTest?: boolean
}

const initialTestEndpoints: TestEndpointConfig[] = [
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
      typeof body.completed === 'boolean' &&
      body.id === 1 // Ensure it's specifically todo 1
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
    validateBody: (
      body: any,
      requestBody: any // Now uses requestBody
    ) =>
      body &&
      typeof body.id === 'number' &&
      body.title === requestBody.title &&
      body.completed === requestBody.completed
  },
  {
    name: 'POST /todos, then GET and Validate',
    method: 'POST',
    path: '/todos',
    expectedStatus: 201,
    expectedContentType: 'application/json',
    requestBody: { title: 'Validate Me Todo', completed: true },
    validateBody: (
      body: any,
      requestBody: any // For the POST part
    ) =>
      body &&
      typeof body.id === 'number' &&
      body.title === requestBody.title &&
      body.completed === requestBody.completed,
    isSequentialTest: true
  }
]

const Judger: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState<string>('http://localhost:8080') // Default to FastAPI port
  const [results, setResults] = useState<TestResult[]>([])
  const [score, setScore] = useState<number>(0)
  const [testing, setTesting] = useState<boolean>(false)
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null)

  const initializeResults = () => {
    return initialTestEndpoints.map(
      (endpoint) =>
        ({
          id: endpoint.name,
          endpoint: endpoint.name,
          url: '',
          method: endpoint.method,
          expectedStatus: endpoint.expectedStatus,
          expectedContentType: endpoint.expectedContentType,
          actualStatus: undefined,
          actualContentType: undefined,
          responseBody: undefined,
          passed: false,
          reason: '',
          testStatus: 'pending'
        }) as TestResult
    )
  }

  useEffect(() => {
    setResults(initializeResults())
  }, [])

  const handleTest = async () => {
    setTesting(true)
    setExpandedTestId(null) // Collapse all cards
    let currentScore = 0
    const newResults = initializeResults() // Reset results to pending
    setResults(newResults)

    for (let i = 0; i < initialTestEndpoints.length; i++) {
      const endpoint = initialTestEndpoints[i]
      const currentResultIndex = newResults.findIndex(
        (r) => r.id === endpoint.name
      )

      // Update status to running
      newResults[currentResultIndex] = {
        ...newResults[currentResultIndex],
        testStatus: 'running',
        url: `${baseUrl}${endpoint.path}` // Set URL when test starts
      }
      setResults([...newResults])

      let passed = false
      let reason = ''
      let actualStatus: number | undefined
      let actualContentType: string | undefined
      let responseBody: any
      let finalUrl = `${baseUrl}${endpoint.path}`

      try {
        if (endpoint.isSequentialTest && endpoint.requestBody) {
          // --- Sequential Test Logic (POST then GET) ---
          newResults[currentResultIndex].method = 'POST then GET'
          const postRequestData = endpoint.requestBody
          let postId: number | undefined

          // Step 1: POST
          const postOptions: RequestInit = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postRequestData)
          }
          const postResponse = await fetch(
            `${baseUrl}${endpoint.path}`,
            postOptions
          )
          actualStatus = postResponse.status // Status for the POST part
          actualContentType =
            postResponse.headers.get('Content-Type') || undefined

          let postResponseBody: any
          if (
            actualContentType &&
            actualContentType.includes('application/json')
          ) {
            postResponseBody = await postResponse.json()
          } else {
            postResponseBody = await postResponse.text()
            throw new Error('POST response is not JSON.')
          }
          responseBody = { post: postResponseBody }

          if (actualStatus !== endpoint.expectedStatus) {
            throw new Error(
              `POST Status mismatch. Expected ${endpoint.expectedStatus}, got ${actualStatus}.`
            )
          }
          if (
            endpoint.expectedContentType &&
            (!actualContentType ||
              !actualContentType.includes(endpoint.expectedContentType))
          ) {
            throw new Error(
              `POST Content-Type mismatch. Expected ${endpoint.expectedContentType}, got ${actualContentType}.`
            )
          }
          if (
            endpoint.validateBody &&
            !endpoint.validateBody(postResponseBody, postRequestData)
          ) {
            throw new Error('POST response body validation failed.')
          }
          postId = postResponseBody.id
          if (typeof postId !== 'number') {
            throw new Error('POST response did not include a numeric ID.')
          }

          // Step 2: GET
          const getUrl = `${baseUrl}/todos/${postId}`
          finalUrl = `${baseUrl}${endpoint.path} (POST) -> ${getUrl} (GET)`
          newResults[currentResultIndex].url = finalUrl // Update URL for display

          const getResponse = await fetch(getUrl, { method: 'GET' })
          actualStatus = getResponse.status // Status for the GET part
          actualContentType =
            getResponse.headers.get('Content-Type') || undefined

          let getResponseBody: any
          if (
            actualContentType &&
            actualContentType.includes('application/json')
          ) {
            getResponseBody = await getResponse.json()
          } else {
            getResponseBody = await getResponse.text()
            throw new Error(`GET /todos/${postId} response is not JSON.`)
          }
          responseBody.get = getResponseBody

          if (actualStatus !== 200) {
            // GET always expects 200
            throw new Error(
              `GET /todos/${postId} Status mismatch. Expected 200, got ${actualStatus}.`
            )
          }
          if (
            !actualContentType ||
            !actualContentType.includes('application/json')
          ) {
            // GET always expects JSON
            throw new Error(
              `GET /todos/${postId} Content-Type mismatch. Expected application/json, got ${actualContentType}.`
            )
          }
          if (
            !(
              getResponseBody.id === postId &&
              getResponseBody.title === postRequestData.title &&
              getResponseBody.completed === postRequestData.completed
            )
          ) {
            throw new Error(
              `GET /todos/${postId} response body did not match original POST data.`
            )
          }
          passed = true // If all checks pass for sequential test
        } else {
          // --- Single Request Test Logic ---
          const options: RequestInit = { method: endpoint.method, headers: {} }
          if (endpoint.method === 'POST' && endpoint.requestBody) {
            ;(options.headers as Record<string, string>)['Content-Type'] =
              'application/json'
            options.body = JSON.stringify(endpoint.requestBody)
          }

          const response = await fetch(`${baseUrl}${endpoint.path}`, options)
          actualStatus = response.status
          actualContentType = response.headers.get('Content-Type') || undefined

          if (
            actualContentType &&
            actualContentType.includes('application/json')
          ) {
            responseBody = await response.json()
          } else {
            responseBody = await response.text() // Store text if not JSON
          }

          passed = actualStatus === endpoint.expectedStatus
          if (!passed) {
            reason = `Status code mismatch. Expected: ${endpoint.expectedStatus}, Actual: ${actualStatus}`
          }

          if (passed && endpoint.expectedContentType) {
            if (
              !actualContentType ||
              !actualContentType.includes(endpoint.expectedContentType)
            ) {
              passed = false
              reason = `Content-Type mismatch. Expected: ${
                endpoint.expectedContentType
              }, Actual: ${actualContentType || 'N/A'}`
            }
          }
          if (passed && endpoint.validateBody) {
            if (!endpoint.validateBody(responseBody, endpoint.requestBody)) {
              passed = false
              reason = reason || 'Response body validation failed.'
            }
          }
        }
        if (passed) currentScore++
      } catch (error: any) {
        passed = false
        reason = error.message || 'An unknown error occurred.'
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          reason =
            'Network error or CORS issue. Check backend is running and allows requests from this origin (localhost:5173). Check browser console for more details.'
        }
      }

      newResults[currentResultIndex] = {
        ...newResults[currentResultIndex],
        actualStatus,
        actualContentType,
        responseBody,
        passed,
        reason: passed ? '' : reason,
        testStatus: passed ? 'passed' : 'failed',
        url: finalUrl
      }
      setResults([...newResults])

      if (!passed) {
        break // Stop further tests if one fails
      }
    }

    setScore(currentScore)
    setTesting(false)
  }

  const toggleExpand = (id: string) => {
    setExpandedTestId(expandedTestId === id ? null : id)
  }

  const getCardStatusClass = (
    status: TestResult['testStatus'],
    passed: boolean
  ) => {
    if (status === 'failed' || (status === 'passed' && !passed))
      return 'border-red-500 bg-red-50'
    if (status === 'passed' && passed) return 'border-green-500 bg-green-50'
    if (status === 'running') return 'border-blue-300 bg-blue-50' // For running
    return 'border-gray-300 bg-gray-50' // Pending
  }

  const getStatusIcon = (status: TestResult['testStatus'], passed: boolean) => {
    if (status === 'failed' || (status === 'passed' && !passed))
      return <span className="text-red-500">✖</span>
    if (status === 'passed' && passed)
      return <span className="text-green-500">✔</span>
    if (status === 'running') return <span className="text-blue-500">⏳</span>
    return <span className="text-gray-500">⚪</span> // Pending
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
          placeholder="e.g., http://localhost:8000"
        />
      </div>
      <button
        onClick={handleTest}
        disabled={testing}
        className="mb-6 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {testing ? 'Testing...' : 'Start All Tests'}
      </button>

      <div className="mt-1">
        <h2 className="text-xl font-semibold">
          Test Progress (Score: {score}/{initialTestEndpoints.length})
        </h2>
        {results.length === 0 && !testing && (
          <p className="text-gray-600">
            Click "Start All Tests" to run the API checks.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {results.map((resultItem) => (
          <div
            key={resultItem.id}
            className={`rounded-lg border-2 p-4 shadow-md transition-all duration-300 hover:shadow-lg ${getCardStatusClass(
              resultItem.testStatus,
              resultItem.passed
            )}`}
          >
            <div
              className="flex cursor-pointer items-center justify-between"
              onClick={() => toggleExpand(resultItem.id)}
            >
              <div className="flex items-center">
                <div className="mr-3 text-xl">
                  {getStatusIcon(resultItem.testStatus, resultItem.passed)}
                </div>
                <h3 className="font-semibold">{resultItem.endpoint}</h3>
              </div>
              <div className="flex items-center">
                <span
                  className="mr-2 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{
                    backgroundColor:
                      resultItem.testStatus === 'failed' ||
                      (resultItem.testStatus === 'passed' && !resultItem.passed)
                        ? '#f87171' // red-400
                        : resultItem.testStatus === 'passed' &&
                            resultItem.passed
                          ? '#4ade80' // green-400
                          : resultItem.testStatus === 'running'
                            ? '#60a5fa' // blue-400
                            : '#9ca3af' // gray-400
                  }}
                >
                  {resultItem.testStatus.charAt(0).toUpperCase() +
                    resultItem.testStatus.slice(1)}
                  {resultItem.testStatus === 'passed' &&
                    !resultItem.passed &&
                    ' (Validation Failed)'}
                </span>
                <span
                  className="ml-2 text-gray-500 transition-transform duration-200"
                  style={{
                    transform:
                      expandedTestId === resultItem.id
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)'
                  }}
                >
                  ▼
                </span>
              </div>
            </div>
            {expandedTestId === resultItem.id && (
              <div className="mt-4 border-t pt-4 text-sm">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <p className="flex items-baseline">
                    <span className="mr-2 font-semibold">URL:</span>{' '}
                    {resultItem.url || 'N/A'}
                  </p>
                  <p className="flex items-baseline">
                    <span className="mr-2 font-semibold">Method:</span>{' '}
                    {resultItem.method}
                  </p>
                  <p className="flex items-baseline">
                    <span className="mr-2 font-semibold">Expected Status:</span>{' '}
                    {resultItem.expectedStatus}
                  </p>
                  {resultItem.actualStatus !== undefined && (
                    <p className="flex items-baseline">
                      <span className="mr-2 font-semibold">Actual Status:</span>
                      <span
                        className={
                          resultItem.actualStatus === resultItem.expectedStatus
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        {resultItem.actualStatus}
                      </span>
                    </p>
                  )}
                  {resultItem.expectedContentType && (
                    <p className="flex items-baseline">
                      <span className="mr-2 font-semibold">
                        Expected Content-Type:
                      </span>{' '}
                      {resultItem.expectedContentType}
                    </p>
                  )}
                  {resultItem.actualContentType && (
                    <p className="flex items-baseline">
                      <span className="mr-2 font-semibold">
                        Actual Content-Type:
                      </span>{' '}
                      <span
                        className={
                          resultItem.actualContentType &&
                          resultItem.expectedContentType &&
                          resultItem.actualContentType.includes(
                            resultItem.expectedContentType
                          )
                            ? 'text-green-600'
                            : 'text-red-600'
                        }
                      >
                        {resultItem.actualContentType}
                      </span>
                    </p>
                  )}
                </div>

                {!resultItem.passed && resultItem.reason && (
                  <div className="mt-3 rounded-md bg-red-50 p-3 text-red-700">
                    <span className="font-semibold">Failure Reason:</span>{' '}
                    {resultItem.reason}
                  </div>
                )}

                {resultItem.responseBody && (
                  <div className="mt-3">
                    <p className="font-semibold">Response Body:</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-gray-100 p-3 text-xs">
                      {typeof resultItem.responseBody === 'object'
                        ? JSON.stringify(resultItem.responseBody, null, 2)
                        : String(resultItem.responseBody)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Judger
