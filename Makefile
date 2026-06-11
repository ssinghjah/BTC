.PHONY: install serve clean

install:
	@bash setup.sh

serve:
	@bash start_trading_rules_gui.sh

clean:
	rm -rf .venv
	@echo "🗑️  Removed .venv"
