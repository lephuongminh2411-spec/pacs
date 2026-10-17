/* Estimate only: chart surface and Cb/K are PACS model inputs, not surveyed depths
   or vessel-calibrated coefficients. Barrass-style K*Cb*V_water^2/100.
   Without measured STW, SOG is explicitly used as a proxy. */
(function(root){
 function calculate({depth,water,draft,speed,cb=.75,k=1.5,allowance=.3}){
  const squat=k*cb*Math.max(0,speed)**2/100;
  return {depth,water,draft,speed,squat,allowance,ukc:depth+water-draft-squat-allowance};
 }
 root.PacsUkc={calculate};
})(globalThis);
