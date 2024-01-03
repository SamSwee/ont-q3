const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { createAuthRequest, requestQR, queryQRResult, cancelQueryQRResult } = require('ontlogin'); 
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());

app.use(session({
  secret: 'my-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.get('/', (req, res) => {
  res.send(`
      <html>
      <h2>ONT Login Example</h2>
      <button onclick="startONTLogin()">ONT Login</button>
      <div id="qrCode"></div>
      <script>
          async function startONTLogin() {
              const response = await fetch('/authRequest');
              const data = await response.json();
              const qrCodeData = JSON.parse(data.qrCodeText);
              const qrCodeUrl = qrCodeData.ONTAuthScanProtocol;
              document.getElementById('qrCode').innerHTML = '<img src="' + qrCodeUrl + '" alt="Scan QR Code" />';
          }
      </script>
  </body>
      </html>
  `);
});

// Endpoint to generate authRequest for the client
app.get('/authRequest', async (req, res) => {
  try {
    const authRequest = createAuthRequest();
    const challengeResponse = await fetch('http://localhost:3000/challenge', {
            method: 'POST',
            body: JSON.stringify({ authRequest }),
            headers: { 'Content-Type': 'application/json' }
        });
    const challenge = await challengeResponse.json();

    // Request QR code from ONT Login QR server
    const { text, id } = await requestQR(challenge);
    res.json({ qrCodeText: text, qrId: id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error generating authentication request', error: error.message });
  }
});

// Endpoint to handle the challenge
app.post('/challenge', async (req, res) => {
  // Create a nonce (a unique random string)
  const nonce = uuidv4();

  // Construct the challenge response
  const challengeResponse = {
      ver: "1.0",
      type: "ServerHello",
      nonce: nonce,
      server: {
          name: "Test-Server",
          url: "http://localhost:3000/",
          did: "did:ont:ASEGZNMPSsCHWLbzDg6XUMGGUhcGYTfMTW",
          verificationMethod: "YourServerVerificationMethod",
      },
      chain: ["ONT"],
      alg: ["ES256"],
      VCFilters: [
          { type: "EmailCredential", trustRoot: ["did:ont:issuerDID"], required: true }
      ],
      serverProof: {},
  };

  res.json(challengeResponse);
});

// Endpoint to handle challenge response to the server
app.post('/submitChallenge', async (req, res) => {
  try {
    const { id } = req.body; 
    let challengeResponse;
        try {
            challengeResponse = await queryQRResult(id);
        } catch (e) {
            if (e.message === ErrorEnum.UserCanceled) {
                cancelQueryQRResult();
                return res.status(200).json({ success: false, message: 'User canceled login process' });
            } else {
                throw e;
            }
        }

    // Submit challenge response to your server
    const validationResponse = await fetch('http://localhost:3000/validateChallenge', {
      method: 'POST',
      body: JSON.stringify({ challengeResponse }),
      headers: { 'Content-Type': 'application/json' }
  });
  const validationResult = await validationResponse.json();

  // Handle the result of the validation
  if (validationResult.success) {
      req.session.user = validationResult.user;
      res.json({ success: true, message: 'Login successful' });
  } else {
      res.status(401).json({ success: false, message: 'Login failed' });
  }
} catch (e) {
  res.status(500).json({ success: false, message: 'Error processing challenge response', error: e.message });
}
});

// Endpoint to validate the challenge response
app.post('/validateChallenge', async (req, res) => {
  const { challengeResponse } = req.body;
  // Validate the challenge response
  const isValid = true; 
  if (isValid) {
      res.json({ success: true, user: { /* user data */ } });
  } else {
      res.status(401).json({ success: false, message: 'Invalid challenge response' });
  }
});
  
  // Start the server
  app.listen(3000, () => {
    console.log('Server listening on port 3000');
  });