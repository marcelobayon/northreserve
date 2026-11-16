/* =============================================================================
   funnel.js  ·  Shared engine for the three NorthReserve book funnels.
   Include LAST on each page: <script src="/funnel.js"></script>

   ONE place to edit: paste your Stripe Payment Link URLs into the FUNNELS
   config below (search "PASTE_"). Everything else — checkout, order bump,
   upsell/downsell, events, WebMCP — is shared.
   ============================================================================= */
(function () {
  "use strict";

  var LOGO = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<polygon points="6,52 24,30 32,38 40,16 58,52" fill="#176658"/><polygon points="40,16 58,52 38,52" fill="#125047"/>' +
    '<polygon points="24,30 32,38 26,52 14,52" fill="#1E8A6E"/><polygon points="40,16 35,25 45,25" fill="#E3F1EC"/>' +
    '<polygon points="44,3 46.2,6.8 50,9 46.2,11.2 44,15 41.8,11.2 38,9 41.8,6.8" fill="#F2B441"/></svg>';

  // Where a declined downsell (or a finished flow) should land.
  var THANK_YOU = "/assessment";

  var FUNNELS = {
    "algebra-of-real-estate": {
      title: "The Algebra of Real Estate",
      cover: "/covers/algebra-of-real-estate.png",
      shippingPrice: "$9.95",
      recommendedCalc: { name: "Mortgage Qualification vs Comfortable Payment", url: "/mortgage-qualification" },
      crossSell: "first-time-homebuyer-equation",
      // ---- Stripe Payment Links (create in Stripe, paste the /pay URLs here) ----
      links: {
        ship:      "PASTE_STRIPE_LINK__ALGEBRA_SHIP",         // Free book + shipping only
        shipBump:  "PASTE_STRIPE_LINK__ALGEBRA_SHIP_PLUS_BUMP", // Free book + shipping + $7 worksheets
        upsell:    "PASTE_STRIPE_LINK__ALGEBRA_UPSELL_39",
        downsell:  "PASTE_STRIPE_LINK__ALGEBRA_DOWNSELL_17"
      },
      bump: { name: "Real Estate Math Worksheets", price: 7,
        items: ["Property wealth equation worksheet", "Monthly payment worksheet", "Cash-to-close worksheet", "Ten-year equity projection", "House-hacking analysis sheet"] },
      upsell: { name: "The Real Estate Math Toolkit", price: 39,
        blurb: "The book teaches the concepts. The toolkit helps you apply them to a real property this week.",
        items: ["The digital book", "Interactive property-analysis spreadsheet", "House-hacking worksheet", "Cash-flow worksheet", "Ten-year wealth model", "Home Buying Readiness calculator", "Mortgage Qualification vs Comfortable Payment calculator", "Financial Mountain assessment", "“Your Next Financial Move” worksheet"] },
      downsell: { name: "The Real Estate Math Workbook", price: 17,
        blurb: "Prefer to keep it simple? The core worksheets, no advanced spreadsheet.",
        items: ["Printable worksheets", "Basic property-analysis template", "One-page decision checklist", "Links to the free calculators"] }
    },
    "first-time-homebuyer-equation": {
      title: "The First-Time Homebuyer Equation",
      cover: "/covers/first-time-homebuyer-equation.png",
      shippingPrice: "$9.95",
      recommendedCalc: { name: "Home Buying Readiness", url: "/home-buying-readiness" },
      crossSell: "financial-mountain-field-guide",
      links: {
        ship:      "PASTE_STRIPE_LINK__FTHB_SHIP",
        shipBump:  "PASTE_STRIPE_LINK__FTHB_SHIP_PLUS_BUMP",
        upsell:    "PASTE_STRIPE_LINK__FTHB_UPSELL_39",
        downsell:  "PASTE_STRIPE_LINK__FTHB_DOWNSELL_17"
      },
      bump: { name: "First-Time Buyer Homebuying Checklist", price: 7,
        items: ["Cash-to-close checklist", "Documents checklist", "Questions to ask a lender", "Inspection & repair checklist", "Monthly-payment stress test", "“Am I ready?” scorecard"] },
      upsell: { name: "The Homebuyer Readiness Toolkit", price: 39,
        blurb: "It moves you from “I want to buy” to “I know exactly what to do next.”",
        items: ["First-time buyer workbook", "Home Buying Readiness calculator", "Mortgage Qualification vs Comfortable Payment calculator", "House Poor calculator", "Emergency Fund calculator", "Next $1,000 calculator", "Personalized readiness checklist", "Financial Mountain assessment"] },
      downsell: { name: "The Homebuyer Checklist Pack", price: 17,
        blurb: "The essentials, printable — without the full toolkit.",
        items: ["Printable checklist", "Cash-needed worksheet", "Monthly-payment worksheet", "Document checklist", "Access to the free calculators"] }
    },
    "financial-mountain-field-guide": {
      title: "The Financial Mountain Field Guide",
      cover: "/covers/financial-mountain-field-guide.png",
      shippingPrice: "$9.95",
      recommendedCalc: { name: "Financial Mountain Assessment", url: "/assessment" },
      crossSell: "algebra-of-real-estate",
      links: {
        ship:      "PASTE_STRIPE_LINK__FMFG_SHIP",
        shipBump:  "PASTE_STRIPE_LINK__FMFG_SHIP_PLUS_BUMP",
        upsell:    "PASTE_STRIPE_LINK__FMFG_UPSELL_39",
        downsell:  "PASTE_STRIPE_LINK__FMFG_DOWNSELL_17"
      },
      bump: { name: "Financial Mountain Progress Workbook", price: 7,
        items: ["The mountain map", "Zone worksheets", "Monthly progress tracker", "Next $1,000 plan", "Debt-reduction worksheet", "Emergency-fund target sheet"] },
      upsell: { name: "The Financial Mountain Starter System", price: 39,
        blurb: "The book explains the system; this makes the system operational.",
        items: ["Field Guide ebook", "Financial Mountain workbook", "All nine NorthReserve calculators", "Financial Mountain assessment", "Personalized Next Move", "Research-paper library", "Progress-tracking template", "Early access to the 3D AR Financial Mountain experience"] },
      downsell: { name: "The Financial Mountain Workbook", price: 17,
        blurb: "The workbook on its own — start climbing with the free calculators.",
        items: ["Printable mountain map", "Zone worksheets", "Monthly tracker", "Next-action planner", "Access to the free calculators"] }
    }
  };

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function getFunnel(slug){ return FUNNELS[slug] || null; }
  function slugFromQuery(){ try{ return new URLSearchParams(location.search).get("f") || ""; }catch(e){ return ""; } }
  function track(name, params){ try{ if(window.gtag) window.gtag("event", name, params||{}); }catch(e){} }
  function isPlaceholder(url){ return !url || url.indexOf("PASTE_") === 0; }

  function go(url, note){
    if (isPlaceholder(url)) { alert("Checkout isn't connected yet.\n\nPaste your Stripe Payment Link into funnel.js (" + (note||"") + ")."); return; }
    window.location.href = url;
  }

  function renderHeader(id){
    var el=document.getElementById(id); if(!el) return;
    el.className="nrc-nav";
    el.innerHTML='<div class="nrc-nav-inner"><a class="nrc-brand" href="/">'+LOGO+'North<span class="r">Reserve</span></a>'+
      '<nav><a href="/tools">Free tools</a><a href="/assessment">Assessment</a></nav></div>';
  }

  // ---- Front-end checkout: free book + shipping, with an order bump --------
  function renderCheckout(id, slug){
    var el=document.getElementById(id), f=getFunnel(slug); if(!el||!f) return;
    var b=f.bump;
    el.className="checkout";
    el.innerHTML=
      '<div class="eyebrow gold">Your free copy</div>'+
      '<div class="price"><s>$0</s>Free book</div>'+
      '<div class="sh">Just cover '+esc(f.shippingPrice)+' U.S. shipping &amp; handling. The digital copy is included free.</div>'+
      '<label class="bump"><input type="checkbox" id="nrBump">'+
        '<span><span class="bt">Add the '+esc(b.name)+' — <span class="bp">+$'+b.price+'</span></span>'+
        '<span class="bd">Use the book the day it arrives:</span>'+
        '<ul class="mini">'+b.items.map(function(i){return "<li>"+esc(i)+"</li>";}).join("")+'</ul></span></label>'+
      '<button class="btn btn-primary" id="nrBuy">Send me the book →</button>'+
      '<div class="trust">Secure checkout by Stripe · address collected at checkout · 100% money-back on S&amp;H</div>';
    track("funnel_viewed", { funnel: slug });
    var bump=el.querySelector("#nrBump");
    bump.addEventListener("change", function(){ track("order_bump_selected", { funnel: slug, selected: bump.checked }); });
    el.querySelector("#nrBuy").addEventListener("click", function(){
      var withBump=bump.checked;
      track("checkout_clicked", { funnel: slug, order_bump: withBump });
      go(withBump ? f.links.shipBump : f.links.ship, withBump ? "links.shipBump" : "links.ship");
    });
  }

  // ---- Upsell / downsell pages (driven by ?f=slug) -------------------------
  function renderOffer(id, type){
    var el=document.getElementById(id); if(!el) return;
    var slug=slugFromQuery(), f=getFunnel(slug);
    if(!f){ el.innerHTML='<p>Offer not found. <a href="/tools">Browse the free tools →</a></p>'; return; }
    var o=f[type], isUp=(type==="upsell");
    el.innerHTML=
      '<div class="offer">'+
        '<div class="eyebrow gold">'+(isUp?"One-time offer for readers":"Before you go — a simpler option")+'</div>'+
        '<h2 style="margin-top:6px">'+esc(o.name)+'</h2>'+
        '<div class="p"><s>$'+(isUp?"79":"29")+'</s>$'+o.price+'</div>'+
        (o.blurb?'<p>'+esc(o.blurb)+'</p>':"")+
        '<ul>'+o.items.map(function(i){return "<li>"+esc(i)+"</li>";}).join("")+'</ul>'+
        '<button class="btn btn-primary" id="nrAccept">Yes — add '+esc(o.name)+' for $'+o.price+' →</button>'+
        '<div style="text-align:center"><button class="decline" id="nrDecline">'+(isUp?"No thanks, I'll pass on this":"No thanks — take me to my results")+'</button></div>'+
      '</div>';
    track(type+"_viewed", { funnel: slug });
    el.querySelector("#nrAccept").addEventListener("click", function(){
      track(type+"_accepted", { funnel: slug });
      go(o.links ? o.links : f.links[type], "links."+type);
    });
    el.querySelector("#nrDecline").addEventListener("click", function(){
      track(type+"_declined", { funnel: slug });
      window.location.href = isUp ? ("/downsell?f="+encodeURIComponent(slug)) : THANK_YOU;
    });
  }

  function renderDisclosure(id){
    var el=document.getElementById(id); if(!el) return;
    el.className="disclosure";
    el.innerHTML="Educational materials and tools, general in nature — not personalized financial, investment, or tax advice. "+
      "Mortgage guidance is provided by Marcelo Bayon, licensed Mortgage Loan Officer, NMLS #1851997; Equal Housing Opportunity. "+
      "“Free book” means the book is free and you cover shipping &amp; handling."+
      '<div class="nr-foot" style="margin-top:16px"><b>NorthReserve</b> · Know where you stand. Climb with confidence.</div>';
  }

  // ---- WebMCP: read-only offer info (agents can describe it; never purchase) -
  function registerInfoTool(slug){
    var f=getFunnel(slug); if(!f) return;
    try{
      if(navigator.modelContext && navigator.modelContext.registerTool){
        navigator.modelContext.registerTool({
          name: "northreserve_book_offer",
          description: "Get details of the NorthReserve book offer on this page: title, what's included, the free-plus-shipping front end, the optional add-on, and the upgrade options. Informational only — it cannot make a purchase.",
          inputSchema: { type:"object", properties:{} },
          execute: function(){ return {
            title: f.title, frontEnd: "Free book, you pay "+f.shippingPrice+" U.S. shipping & handling (digital copy included).",
            orderBump: f.bump.name+" (+$"+f.bump.price+")",
            upgrade: f.upsell.name+" ($"+f.upsell.price+")", simplerOption: f.downsell.name+" ($"+f.downsell.price+")",
            note: "To buy, use the checkout button on the page." }; }
        });
      }
    }catch(e){}
  }

  window.NRFunnel = {
    FUNNELS: FUNNELS, getFunnel: getFunnel, slugFromQuery: slugFromQuery, track: track,
    renderHeader: renderHeader, renderCheckout: renderCheckout, renderOffer: renderOffer,
    renderDisclosure: renderDisclosure, registerInfoTool: registerInfoTool
  };
})();
