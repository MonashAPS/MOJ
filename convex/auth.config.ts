export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "moj",
      issuer: process.env.AUTH_ISSUER,
      jwks: process.env.AUTH_JWKS_URL,
      algorithm: "RS256",
    },
  ],
};
