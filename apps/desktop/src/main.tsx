void (import.meta.env.VITE_MOBILE_HOME === '1' || import.meta.env.VITE_IPAD_HOME === '1'
  ? import('./ipad-main')
  : import('./desktop-main'))
