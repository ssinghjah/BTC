import Stripe from "stripe";
import { config } from "./config.js";


export const stripe = new Stripe(config.stripeSecret);


export async function createCheckout() {
return stripe.checkout.sessions.create({
mode: "subscription",
payment_method_types: ["card"],
line_items: [{ price: config.stripePriceId, quantity: 1 }],
success_url: "http://localhost:3000/success",
cancel_url: "http://localhost:3000"
});
}