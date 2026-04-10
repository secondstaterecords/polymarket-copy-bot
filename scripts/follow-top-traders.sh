#!/bin/bash
# Follow top 15 Polymarket traders via Bullpen tracker
# Run this when the tracker API is back online
export PATH="/Users/max/.local/bin:$PATH"

ADDRESSES=(
  "0x492442eab586f242b53bda933fd5de859c8a3782"  # 0x4924 - PnL $6.6M
  "0xc2e7800b5af46e6093872b177b7a5e7f0563be51"  # beachboy4 - PnL $3.5M
  "0xbddf61af533ff524d27154e589d2d7a81510c684"  # Countryside - PnL $2.1M
  "0x2005d16a84ceefa912d4e380cd32e7ff827875ea"  # RN1 - PnL $2.0M
  "0xee613b3fc183ee44f9da9c05f53e2da107e3debf"  # sovereign2013 - PnL $1.7M
  "0x2a2c53bd278c04da9962fcf96490e17f3dfb9bc1"  # 0x2a2c - PnL $1.7M
  "0xc8075693f48668a264b9fa313b47f52712fcc12b"  # texaskid - PnL $1.4M
  "0x204f72f35326db932158cba6adff0b9a1da95e14"  # swisstony - PnL $1.3M
  "0x63a51cbb37341837b873bc29d05f482bc2988e33"  # mhh29 - PnL $1.1M
  "0xb6d6e99d3bfe055874a04279f659f009fd57be17"  # JPMorgan101 - PnL $1.1M
  "0xead152b855effa6b5b5837f53b24c0756830c76a"  # elkmonkey - PnL $1.1M
  "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee"  # kch123 - PnL $1.1M
  "0x2b3ff45c91540e46fae1e0c72f61f4b049453446"  # Mentallyillgambld - PnL $1.0M
  "0xb45a797faa52b0fd8adc56d30382022b7b12192c"  # bcda - PnL $0.97M
  "0x03e8a544e97eeff5753bc1e90d46e5ef22af1697"  # weflyhigh - PnL $0.79M
)

echo "=== Following top 15 traders ==="
for addr in "${ADDRESSES[@]}"; do
  echo "Following $addr..."
  bullpen tracker follow "$addr" --notify-trades true --trade-threshold 10 --output json
  if [ $? -ne 0 ]; then
    echo "  FAILED for $addr"
  fi
  sleep 2
done

echo ""
echo "=== Verifying following list ==="
bullpen tracker following --output json

echo ""
echo "=== Recent trades from followed traders ==="
bullpen tracker trades --output json --limit 20
