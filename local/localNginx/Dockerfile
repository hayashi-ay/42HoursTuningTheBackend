FROM nginx:mainline

COPY local.nginx.conf /etc/nginx/nginx.conf
COPY custom.conf /etc/nginx/conf.d/default.conf

CMD ["nginx", "-g", "daemon off;"]