# Pitch Battle LED

Two-phone turn-based pitcher/hitter game prototype.

## Setup

```bash
npm install
npm start
```

Open the displayed local URL on two phones connected to the same Wi-Fi.

## Optional iPixel LED support

```bash
export LED_ADDR=80CE82D9-A461-A4D3-85E2-40A6D737DDEA
export ENABLE_LED=1
npm start
```

The server calls `pypixelcolor` and maps common results to slots.

## Suggested slot preload

```bash
ADDR=80CE82D9-A461-A4D3-85E2-40A6D737DDEA

python3 -m pypixelcolor -a $ADDR -c send_image idle.gif crop 1
python3 -m pypixelcolor -a $ADDR -c send_image strike.gif crop 2
python3 -m pypixelcolor -a $ADDR -c send_image ball.gif crop 3
python3 -m pypixelcolor -a $ADDR -c send_image foul.gif crop 4
python3 -m pypixelcolor -a $ADDR -c send_image out.gif crop 5
python3 -m pypixelcolor -a $ADDR -c send_image single.gif crop 6
python3 -m pypixelcolor -a $ADDR -c send_image double.gif crop 7
python3 -m pypixelcolor -a $ADDR -c send_image homerun.gif crop 8
python3 -m pypixelcolor -a $ADDR -c send_image inning.gif crop 9
```
