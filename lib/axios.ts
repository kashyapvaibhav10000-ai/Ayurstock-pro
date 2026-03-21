import axios from 'axios';

// Only execute interceptor attachment on the Client Side
if (typeof window !== 'undefined') {

  // Intercept all OUTGOING requests to attach the Bearer token automatically
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Intercept all INCOMING responses to catch rogue 401s universally
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      // If we hit an Unauthorized token expiry and we are NOT already on the login page...
      if (
        error.response?.status === 401 && 
        !window.location.pathname.includes('/login')
      ) {
        // Violently purge the client state
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Add a micro-delay to allow any in-flight promises to gracefully reject 
        // before throwing the user to a completely fresh route context, 
        // preventing React mounting race conditions.
        setTimeout(() => {
          window.location.href = '/login';
        }, 100);
      }
      return Promise.reject(error);
    }
  );

}

export default axios;
