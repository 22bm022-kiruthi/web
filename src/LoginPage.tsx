import React, { useState } from 'react';

const LoginPage: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');

  const handleLogin = () => {
    console.log('LoginPage: Login button clicked', { username });
    setError('');
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    // Hard-coded credential check
    if (username !== '1234' || password !== '9876') {
      setError('Invalid username or password');
      setPassword('');
      return;
    }

    try {
      localStorage.setItem('loggedIn', 'true');
    } catch (e) {
      // ignore
    }
    onLogin();
    try {
      if (typeof window !== 'undefined') {
        // ensure the URL is the app root so App shows the main page
        try { window.history.replaceState({}, '', '/'); } catch (e) { }
      }
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
      {/* Fullscreen slideshow background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center login-slide"
          style={{ backgroundImage: "url('/bg11.png')" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-cover bg-center login-slide"
          style={{ backgroundImage: "url('/bg12.jpg')", animationDelay: '4s' }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-cover bg-center login-slide"
          style={{ backgroundImage: "url('/bg13.jpg')", animationDelay: '8s' }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      </div>

      <div className="relative z-10 flex flex-col items-center bg-white rounded-lg shadow-lg p-8 w-full max-w-md mx-4">
        {/* Company Logo */}
        <img src="/logo_final.png" alt="Company Logo" className="h-20 mb-4" />
        {/* Company Name */}
  <h1 className="text-3xl font-bold mb-2 text-blue-700">DeepSpectrum Pvt Ltd</h1>
        {/* Welcome Message */}
        <p className="mb-6 text-gray-600">Welcome! Please log in to continue.</p>
        {/* Form */}
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="mb-4 px-4 py-2 border rounded w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mb-2 px-4 py-2 border rounded w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

          <button
            type="submit"
            disabled={!username || !password}
            className={`w-full px-6 py-2 rounded font-semibold text-white ${
              !username || !password
                ? 'bg-blue-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
