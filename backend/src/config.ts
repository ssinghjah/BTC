import dotenv from "dotenv";
dotenv.config();


export const config = {
port: 4000,
etherscanKey: process.env.ETHERSCAN_KEY!,
stripeSecret: process.env.STRIPE_SECRET_KEY || "",
stripePriceId: process.env.STRIPE_PRICE_ID || ""
};