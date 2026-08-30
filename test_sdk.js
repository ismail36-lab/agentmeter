async function testTelemetry() {
  try {
    const response = await fetch('http://localhost:3000/api/v1/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mx_live_0aa73e80_Yfi4gkEpg8IlWxesWVUJSilH'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        prompt_tokens: 150,
        completion_tokens: 50,
        metadata: { test_run: 'local_verification' }
      })
    });

    console.log('Status Code:', response.status);
    const result = await response.json();
    console.log('Ingestion Response:', result);
  } catch (error) {
    console.error('Error sending telemetry:', error);
  }
}

testTelemetry()