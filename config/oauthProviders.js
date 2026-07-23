const facebookVersion = process.env.FACEBOOK_API_VERSION || 'v23.0';

/*
  une IA peut facilement inventer une URL OAuth obsolète, surtout pour Meta
  car l'API Graph est versionnée. Pour éviter ça, les URLs sont centralisées ici
  et la version Facebook est configurable avec FACEBOOK_API_VERSION dans le fichier .env
*/

module.exports = {
  google: {
    name: 'Google',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    tokenMethod: 'POST',
    extraAuthParams: {
      prompt: 'select_account'
    }
  },

  github: {
    name: 'GitHub',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
    tokenMethod: 'POST',
    extraAuthParams: {}
  },

  facebook: {
    name: 'Facebook',
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    authorizeUrl: `https://www.facebook.com/${facebookVersion}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${facebookVersion}/oauth/access_token`,
    userinfoUrl: `https://graph.facebook.com/${facebookVersion}/me`,
    scope: 'public_profile,email',
    tokenMethod: 'GET',
    extraAuthParams: {}
  }
};