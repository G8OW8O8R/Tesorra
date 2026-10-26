/** Session flag: the start lights have played. */
export const INTRO_KEY = "tesorra:intro";

/**
 * Runs while the HTML is parsed, before first paint (from the root layout, so client navigations
 * never render it): the lights only play on the first visit of the home page in a session and
 * never under reduced motion.
 */
export const INTRO_SCRIPT = `try{var d=document.documentElement;if(sessionStorage.getItem("${INTRO_KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.intro="skip"}catch(e){}`;
